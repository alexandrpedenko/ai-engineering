"""The persisted policy index (ADR-0008): split, embed, store once, reuse."""

import hashlib

from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

from hotelbot.config import (
    CHROMA_DIR,
    CHUNK_OVERLAP,
    CHUNK_SIZE,
    EMBEDDING_MODEL,
    POLICIES_DIR,
    POLICY_COLLECTION,
)


def policy_fingerprints() -> dict[str, str]:
    """Map each policy file name on disk to a sha256 hash of its contents.

    The hash is a 64-character string that changes if any character of the
    file changes, so comparing two of these dicts tells whether any file was
    added, removed, or edited.
    """
    return {
        path.name: hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(POLICIES_DIR.glob("*.md"))
    }


def stored_fingerprints(index: Chroma) -> dict[str, str]:
    """Map each file name stored in the index to the hash it was built from."""
    metadatas = index.get(include=["metadatas"])["metadatas"]
    return {m["source"]: m.get("sha256") for m in metadatas}


def _load_chunks(fingerprints: dict[str, str]) -> list[Document]:
    splitter = RecursiveCharacterTextSplitter(chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP)
    chunks = []
    for name, digest in fingerprints.items():
        for text in splitter.split_text((POLICIES_DIR / name).read_text()):
            chunks.append(Document(page_content=text, metadata={"source": name, "sha256": digest}))
    return chunks


def _open() -> Chroma:
    return Chroma(
        collection_name=POLICY_COLLECTION,
        embedding_function=OpenAIEmbeddings(model=EMBEDDING_MODEL),
        persist_directory=str(CHROMA_DIR),
    )


def get_policy_index() -> Chroma:
    """Open the persisted policy index, rebuilding it first if it's missing
    or if any policy file was added, removed, or edited since it was built.
    """
    index = _open()
    if stored_fingerprints(index) != policy_fingerprints():
        return rebuild_policy_index()
    return index


def rebuild_policy_index() -> Chroma:
    """Delete every chunk in the policy index and re-embed data/policies/*.md."""
    index = _open()
    old_ids = index.get(include=[])["ids"]
    if old_ids:
        index.delete(ids=old_ids)
    index.add_documents(_load_chunks(policy_fingerprints()))
    return index
