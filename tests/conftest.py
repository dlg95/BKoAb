"""Keep tests away from the developer's real ./data directory.

Must run before any `bkoab` import, because paths are resolved at import time.
"""

import os
import tempfile

os.environ.setdefault("BKOAB_DATA_DIR", tempfile.mkdtemp(prefix="bkoab-test-data-"))
