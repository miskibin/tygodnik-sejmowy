import io
import json
import traceback
import httpx
import pytest
from PIL import Image
from supagraf.enrich.illustrations import providers


def image_bytes():
    out=io.BytesIO();Image.new('RGB',(640,400),'#eee').save(out,format='PNG');return out.getvalue()


def test_limit_is_bounded(tmp_path):
    with pytest.raises(ValueError):providers.search_pixabay('lake',tmp_path,limit=3,client=object())


def test_pixabay_errors_do_not_expose_key_in_traceback(monkeypatch,tmp_path):
    monkeypatch.setenv('PIXABAY_API_KEY','SECRET-DO-NOT-PRINT')
    def handle(request):
        raise httpx.ConnectError(str(request.url))
    with httpx.Client(transport=httpx.MockTransport(handle)) as client:
        with pytest.raises(providers.ProviderError) as exc:providers.search_pixabay('lake',tmp_path,client=client)
    assert 'SECRET-DO-NOT-PRINT' not in ''.join(traceback.format_exception(exc.type,exc.value,exc.tb))


def test_download_rejects_redirect_to_untrusted_host(tmp_path):
    def handle(request):return httpx.Response(302,headers={'location':'https://evil.example/payload'})
    with httpx.Client(transport=httpx.MockTransport(handle)) as client:
        with pytest.raises(providers.ProviderError,match='untrusted'):providers._download(client,'https://cdn.pixabay.com/photo.jpg',tmp_path/'x.jpg')


def test_cache_reuses_verified_file_and_refetches_corruption(monkeypatch,tmp_path):
    monkeypatch.setenv('PIXABAY_API_KEY','SECRET')
    counts={'api':0,'image':0}
    def handle(request):
        if request.url.host=='pixabay.com':
            counts['api']+=1
            assert int(request.url.params['per_page'])>=3
            return httpx.Response(200,json={'hits':[{'id':12,'user':'Photographer','tags':'lake, pier','pageURL':'https://pixabay.com/photos/lake-12/','largeImageURL':'https://cdn.pixabay.com/12.png'}]})
        counts['image']+=1
        return httpx.Response(200,content=image_bytes(),headers={'content-type':'image/png'})
    with httpx.Client(transport=httpx.MockTransport(handle)) as client:
        first=providers.search_pixabay('lake',tmp_path,client=client)
        second=providers.search_pixabay('lake',tmp_path,client=client)
        assert counts=={'api':1,'image':1}
        assert first==second and first[0].local_path.endswith('.png')
        assert first[0].metadata['source_tags']=='lake, pier'
        from pathlib import Path
        Path(first[0].local_path).write_bytes(b'corrupted')
        providers.search_pixabay('lake',tmp_path,client=client)
        assert counts=={'api':1,'image':2}
    assert 'SECRET' not in ''.join(p.read_text() for p in tmp_path.rglob('*.json'))


def test_stream_rejects_oversize_body_without_writing(monkeypatch,tmp_path):
    monkeypatch.setattr(providers,'MAX_BYTES',10)
    with httpx.Client(transport=httpx.MockTransport(lambda r:httpx.Response(200,content=b'x'*20,headers={'content-type':'image/jpeg'}))) as client:
        with pytest.raises(providers.ProviderError,match='too large'):providers._download(client,'https://cdn.pixabay.com/x.jpg',tmp_path/'x.jpg')
    assert not list(tmp_path.iterdir())


@pytest.mark.parametrize('field,value',[('Restrictions','permission required'),('Artist',''),('LicenseUrl','https://creativecommons.org/not-a-license'),('LicenseShortName','CC BY-NC 4.0')])
def test_commons_unusable_rights_never_download(field,value,tmp_path):
    meta={k:{'value':v} for k,v in {'Artist':'Author','LicenseShortName':'CC BY-SA 4.0','LicenseUrl':'https://creativecommons.org/licenses/by-sa/4.0/'}.items()};meta[field]={'value':value}
    def handle(request):
        assert request.url.host=='commons.wikimedia.org'
        return httpx.Response(200,json={'query':{'pages':{'1':{'title':'File:Lake.jpg','imageinfo':[{'url':'https://upload.wikimedia.org/x.jpg','descriptionurl':'https://commons.wikimedia.org/wiki/File:Lake.jpg','width':1200,'height':800,'mime':'image/jpeg','extmetadata':meta}]}}}})
    with httpx.Client(transport=httpx.MockTransport(handle)) as client:
        assert providers.search_commons('File:Lake.jpg',tmp_path,client=client)==[]
