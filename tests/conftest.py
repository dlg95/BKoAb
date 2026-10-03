"""Keep tests away from the developer's real ./data directory.

Must run before any `bkoab` import, because paths are resolved at import time.
"""

import os
import tempfile

_root = tempfile.mkdtemp(prefix="bkoab-test-")
os.environ.setdefault("BKOAB_DATA_DIR", os.path.join(_root, "data"))
os.environ.setdefault("BKOAB_BACKUP_DIR", os.path.join(_root, "backups"))
