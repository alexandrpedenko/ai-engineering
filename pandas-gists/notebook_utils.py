import os

def get_data_path(filename, base_dir='files'):
    """Return an absolute path to `filename` inside `base_dir` from the repo root.

    Raises FileNotFoundError if the file doesn't exist.
    """
    path = os.path.join(os.getcwd(), base_dir, filename)
    if not os.path.exists(path):
        raise FileNotFoundError(f"File not found: {path}")
    return path
