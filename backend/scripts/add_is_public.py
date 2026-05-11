"""One-shot migration: add trained_model.is_public column.

Usage (from backend/):
    python -m scripts.add_is_public
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from database import engine


def main():
    with engine.begin() as conn:
        exists = conn.execute(
            text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'trained_model' AND column_name = 'is_public'
                """
            )
        ).scalar()

        if exists:
            print("trained_model.is_public already exists, nothing to do.")
            return

        conn.execute(
            text(
                "ALTER TABLE trained_model "
                "ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT FALSE"
            )
        )
        print("Added column trained_model.is_public (BOOLEAN NOT NULL DEFAULT FALSE).")


if __name__ == "__main__":
    main()
