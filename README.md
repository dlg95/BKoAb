# BKoAb — Betriebskostenabrechnung WG

Betriebskosten-Abrechnungstool für WG-Vermietungen mit pro-Personen-Umlage.

## Installation

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cd frontend && pnpm install && cd ..
```

## Start

```bash
./run.sh
```

- API: http://127.0.0.1:8000
- Frontend: http://127.0.0.1:5173

## Hinweis

Dieses Tool unterstützt bei der Erstellung von Betriebskostenabrechnungen, ersetzt aber keine Rechtsberatung.

Geplante Erweiterungen: [ROADMAP.md](ROADMAP.md)
