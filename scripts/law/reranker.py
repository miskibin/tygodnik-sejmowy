# /// script
# requires-python = ">=3.11"
# dependencies = ["torch==2.7.1", "transformers==4.51.3"]
# ///
"""Optional CPU reranker. Scores relevance, never legal applicability."""
import argparse
import json
import math
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODEL = "Qwen/Qwen3-Reranker-0.6B"
INSTRUCTION = "Retrieve Polish legal provisions relevant to the question, including definitions and exceptions."
PREFIX = '<|im_start|>system\nEvaluate whether the supplied document is relevant to the query under the instruction. Respond only yes or no.<|im_end|>\n<|im_start|>user\n'
SUFFIX = '<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n'


class Ranker:
    def __init__(self, revision):
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
        torch.set_num_threads(2)
        self.torch = torch
        self.revision = revision
        self.tokenizer = AutoTokenizer.from_pretrained(MODEL, revision=revision, padding_side="left")
        self.model = AutoModelForCausalLM.from_pretrained(MODEL, revision=revision, torch_dtype=torch.float32).to("cpu").eval()
        self.yes = self.tokenizer.convert_tokens_to_ids("yes")
        self.no = self.tokenizer.convert_tokens_to_ids("no")
        self.lock = threading.Lock()

    def score(self, query, documents):
        encoded = [self.tokenizer.encode(PREFIX + f"<Instruct>: {INSTRUCTION}\n<Query>: {query}\n<Document>: {doc}" + SUFFIX,
                                         add_special_tokens=False) for doc in documents]
        if any(len(tokens) > 8192 for tokens in encoded):
            raise ValueError("A complete document exceeds the configured token budget; no truncation performed")
        scores = []
        with self.torch.inference_mode():
            for tokens in encoded:
                inputs = self.torch.tensor([tokens], device="cpu")
                logits = self.model(input_ids=inputs).logits[0, -1]
                scores.append(float((logits[self.yes] - logits[self.no]).item()))
        if not all(math.isfinite(score) for score in scores):
            raise ValueError("Non-finite ranking output")
        return scores


def handler(ranker):
    class Handler(BaseHTTPRequestHandler):
        def respond(self, status, value):
            body = json.dumps(value).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path != "/health":
                return self.respond(404, {"error": "unknown_path"})
            self.respond(200, {"model": MODEL, "revision": ranker.revision, "device": "cpu", "score_kind": "relevance_logit_difference"})

        def do_POST(self):
            if self.path != "/rerank":
                return self.respond(404, {"error": "unknown_path"})
            try:
                size = int(self.headers.get("Content-Length", 0))
                if not 0 < size <= 2_000_000:
                    return self.respond(413, {"error": "request_too_large"})
                data = json.loads(self.rfile.read(size))
                query, documents = data["query"], data["documents"]
                if not isinstance(query, str) or not 1 <= len(query) <= 1000:
                    raise ValueError("Invalid query")
                if not isinstance(documents, list) or not 1 <= len(documents) <= 50 or not all(isinstance(d, str) and 0 < len(d) <= 200000 for d in documents):
                    raise ValueError("Invalid documents")
            except (KeyError, ValueError, TypeError):
                return self.respond(400, {"error": "invalid_request"})
            if not ranker.lock.acquire(blocking=False):
                return self.respond(429, {"error": "reranker_busy"})
            try:
                self.respond(200, {"scores": ranker.score(query, documents), "model": MODEL, "revision": ranker.revision,
                                   "score_kind": "relevance_logit_difference"})
            except ValueError as error:
                self.respond(422, {"error": str(error)})
            except (BrokenPipeError, ConnectionResetError):
                pass
            finally:
                ranker.lock.release()
    return Handler


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--revision", required=True, help="Pinned 40-character Hugging Face commit")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=9121)
    args = parser.parse_args()
    if not re.fullmatch(r"[a-f0-9]{40}", args.revision):
        parser.error("An immutable model revision is required")
    ranker = Ranker(args.revision)
    ThreadingHTTPServer((args.host, args.port), handler(ranker)).serve_forever()
