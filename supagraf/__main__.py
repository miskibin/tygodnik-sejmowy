"""`python -m supagraf <group> <cmd>` root."""
import typer

from supagraf.cli import app as core_app
from supagraf.fixtures.capture import app as fixtures_app
from supagraf.sync.cli import app as sync_app


app = typer.Typer(no_args_is_help=True, add_completion=False)
app.add_typer(fixtures_app, name="fixtures", help="Capture Sejm/ELI fixtures.")
# Updater (daily / sync / db-exec) and core commands hoisted to top level.
for src in (sync_app, core_app):
    app.registered_commands.extend(src.registered_commands)
    app.registered_groups.extend(src.registered_groups)


if __name__ == "__main__":
    app()
