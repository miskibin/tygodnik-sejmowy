"""Bounded stock downloads with provenance, key-safe errors and a 24-hour cache."""
from __future__ import annotations
import hashlib
import io
import json
import os
import time
from pathlib import Path
from urllib.parse import urljoin, urlsplit
import httpx
from PIL import Image
from supagraf.enrich.story_images import parse_image, plain, USER_AGENT
from .models import Candidate

MAX_RESULTS = 2
MAX_BYTES = 12 * 1024 * 1024
CACHE_TTL = 86400
PIXABAY_API = 'https://pixabay.com/api/'
COMMONS_API = 'https://commons.wikimedia.org/w/api.php'
ALLOWED_IMAGE_HOSTS = {'cdn.pixabay.com','pixabay.com','upload.wikimedia.org','thumb.wikimedia.org'}

class ProviderError(RuntimeError):
    """Deliberately excludes request URLs and authentication from diagnostics."""


def _limit(value: int) -> int:
    if not 1 <= value <= MAX_RESULTS:
        raise ValueError('limit must be between 1 and 2')
    return value


def _key() -> str:
    if not os.environ.get('PIXABAY_API_KEY'):
        from supagraf.db import load_dotenv
        load_dotenv()
    key = os.environ.get('PIXABAY_API_KEY')
    if not key:
        raise ProviderError('Pixabay key unavailable')
    return key


def _safe_url(url: str, hosts: set[str] = ALLOWED_IMAGE_HOSTS) -> bool:
    try:
        p = urlsplit(url)
        return p.scheme == 'https' and not p.username and p.hostname in hosts and p.port in (None,443)
    except (TypeError, ValueError):
        return False


def _json(client: httpx.Client, url: str, params: dict) -> dict:
    """Read a bounded JSON response without materializing an unbounded body."""
    try:
        with client.stream('GET', url, params=params, follow_redirects=False) as response:
            response.raise_for_status()
            chunks, size = [], 0
            for chunk in response.iter_bytes(65536):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise ProviderError('Provider response too large')
                chunks.append(chunk)
        result = json.loads(b''.join(chunks))
        if not isinstance(result, dict) or 'error' in result:
            raise ProviderError('Provider returned an API error')
        return result
    except ProviderError:
        raise
    except (httpx.HTTPError, ValueError, json.JSONDecodeError):
        raise ProviderError('Provider request failed') from None

def _download(client: httpx.Client, url: str, target: Path) -> tuple[Path, int, int, str]:
    current = url
    try:
        for _ in range(4):
            if not _safe_url(current):
                raise ProviderError('untrusted image host')
            with client.stream('GET', current, follow_redirects=False) as response:
                if response.is_redirect:
                    current = urljoin(current, response.headers.get('location',''))
                    continue
                response.raise_for_status()
                mime = response.headers.get('content-type','').split(';')[0].lower()
                if mime not in {'image/jpeg','image/png','image/webp'}:
                    raise ProviderError('unsupported image type')
                length = response.headers.get('content-length','')
                if length.isdigit() and int(length) > MAX_BYTES:
                    raise ProviderError('image too large')
                chunks, size = [], 0
                for chunk in response.iter_bytes(65536):
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise ProviderError('image too large')
                    chunks.append(chunk)
                body = b''.join(chunks)
            with Image.open(io.BytesIO(body)) as image:
                width, height = image.size
                fmt = image.format
                if width < 600 or height < 300 or width * height > 40_000_000:
                    raise ProviderError('unsupported image dimensions')
                if fmt not in {'JPEG','PNG','WEBP'}:
                    raise ProviderError('unsupported image encoding')
                image.verify()
            path = target.with_suffix({'JPEG':'.jpg','PNG':'.png','WEBP':'.webp'}[fmt])
            path.parent.mkdir(parents=True, exist_ok=True)
            temp = path.with_suffix(path.suffix+'.tmp')
            temp.write_bytes(body)
            temp.replace(path)
            return path, width, height, hashlib.sha256(body).hexdigest()
        raise ProviderError('too many redirects')
    except ProviderError:
        raise
    except (httpx.HTTPError, OSError, ValueError, Image.DecompressionBombError):
        raise ProviderError('image download or verification failed') from None


def _cache_path(output_dir: Path, provider: str, query: str, options: dict) -> Path:
    digest = hashlib.sha256(json.dumps([provider,query,options],sort_keys=True).encode()).hexdigest()
    return output_dir / '.provider-cache' / f'{provider}-{digest}.json'


def _cached(path: Path) -> list[dict] | None:
    try:
        if time.time() - path.stat().st_mtime > CACHE_TTL:
            return None
        result = json.loads(path.read_text(encoding='utf8'))
        if not isinstance(result, list) or not all(isinstance(record, dict) and isinstance(record.get('download_url'), str) for record in result):
            return None
        return result
    except (OSError, ValueError, TypeError):
        return None

def _run(provider, query, output_dir, limit, client, fetch, options) -> list[Candidate]:
    _limit(limit)
    if not query.strip() or len(query)>100:
        raise ValueError('query must be 1-100 characters')
    output_dir = Path(output_dir).resolve()
    cache = _cache_path(output_dir,provider,query,{**options,'version':2})
    raw = _cached(cache)
    own = client is None
    session = client or httpx.Client(timeout=25,headers={'User-Agent':USER_AGENT})
    try:
        if raw is None:
            raw = fetch(session,query,MAX_RESULTS)[:MAX_RESULTS]
        result = []
        failures = 0
        for record in raw[:limit]:
            item = dict(record)
            filename = item.get('filename','')
            if not filename or Path(filename).name != filename:
                raise ProviderError('Invalid cached filename')
            path = output_dir / filename
            expected = item.get('sha256')
            reused = path.is_file() and expected and hashlib.sha256(path.read_bytes()).hexdigest()==expected
            if not reused:
                try:
                    path,width,height,digest = _download(session,item['download_url'],path)
                except ProviderError:
                    failures += 1
                    continue
                record.update(filename=path.name,sha256=digest)
                record['metadata'] = {**record.get('metadata',{}),'width':width,'height':height,'sha256':digest}
            data = {k:v for k,v in record.items() if k not in {'filename','download_url','sha256'}}
            data['local_path'] = str(path)
            result.append(Candidate.model_validate(data))
        cache.parent.mkdir(parents=True,exist_ok=True)
        temp = cache.with_suffix('.tmp')
        temp.write_text(json.dumps(raw,ensure_ascii=False),encoding='utf8')
        temp.replace(cache)
        if failures and not result:
            raise ProviderError('No candidate image could be downloaded')
        return result
    finally:
        if own:
            session.close()


def search_pixabay(query: str, output_dir: Path, limit: int=2, client: httpx.Client|None=None) -> list[Candidate]:
    options={'image_type':'photo','orientation':'horizontal','safesearch':'true','order':'popular'}
    def fetch(c,q,n):
        body=_json(c,PIXABAY_API,{'key':_key(),'q':q,'lang':'en',**options,'per_page':20})
        out=[]
        for hit in body.get('hits',[]):
            if not isinstance(hit.get('id'),int) or not hit.get('user'):
                continue
            source,url=hit.get('pageURL',''),hit.get('largeImageURL','')
            if not _safe_url(source,{'pixabay.com'}) or not _safe_url(url):
                continue
            tags=str(hit.get('tags',''))
            if any(term in tags.lower() for term in ('ai generated','ai-generated','generative ai')):
                continue
            out.append({'id':str(hit['id']),'provider':'pixabay','source_url':source,'author':hit['user'],
              'license':'Pixabay Content License','license_url':'https://pixabay.com/service/license-summary/',
              'caption':'Fotografia ilustracyjna.','identity':tags,'filename':f"pixabay-{hit['id']}.jpg",'download_url':url,
              'metadata':{'source_tags':tags,'authenticity':'unverified; photo API filter is not proof of capture'}})
            if len(out)==n: break
        return out
    return _run('pixabay',query,output_dir,limit,client,fetch,options)


def search_commons(query: str, output_dir: Path, limit: int=2, client: httpx.Client|None=None) -> list[Candidate]:
    def fetch(c,q,n):
        if q.startswith('File:'):
            titles=[q]
        else:
            body=_json(c,COMMONS_API,{'action':'query','format':'json','list':'search','srnamespace':6,'srsearch':q,'srlimit':6})
            titles=[r['title'] for r in body.get('query',{}).get('search',[]) if r.get('title','').startswith('File:')]
        if not titles:return []
        body=_json(c,COMMONS_API,{'action':'query','format':'json','prop':'imageinfo','titles':'|'.join(titles),
            'iiprop':'url|size|mime|extmetadata','iiurlwidth':1280})
        out=[]
        for page in body.get('query',{}).get('pages',{}).values():
            try:
                parsed=parse_image(page,{'id':'editorial-search','caption':'Fotografia ilustracyjna.'})
            except (KeyError,TypeError,ValueError):
                continue
            if not parsed:continue
            ii=page['imageinfo'][0]
            meta=ii.get('extmetadata',{})
            description=plain(str(meta.get('ImageDescription',{}).get('value','')))[:2000]
            if any(term in (page['title']+' '+description).lower() for term in ('ai-generated','ai generated','generated with midjourney')):
                continue
            out.append({'id':page['title'],'provider':'wikimedia_commons','source_url':parsed['source_url'],
              'author':parsed['author'],'license':parsed['license'],'license_url':parsed['license_url'],'caption':parsed['caption'],
              'identity':page['title'],'filename':'commons-'+hashlib.sha256(page['title'].encode()).hexdigest()[:12]+'.jpg',
              'download_url':ii.get('thumburl') or parsed['url'],
              'metadata':{'source_title':page['title'],'description':description,'date':parsed['date']}})
            if len(out)==n:break
        return out
    return _run('commons',query,output_dir,limit,client,fetch,{'namespace':6,'version':2})
