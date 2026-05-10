"""`python -m supagraf <group> <cmd>` root."""
import typer

from supagraf.cli import app as core_app
from supagraf.fixtures.capture import app as fixtures_app


app = typer.Typer(no_args_is_help=True, add_completion=False)
app.add_typer(fixtures_app, name="fixtures", help="Capture Sejm/ELI fixtures.")
# core ingest commands hoisted to top-level: stage / load / run-all
for cmd in core_app.registered_commands:
    app.registered_commands.append(cmd)
# core subgroups hoisted (e.g. `enrich prints --kind ...`)
for grp in core_app.registered_groups:
    app.registered_groups.append(grp)


if __name__ == "__main__":
    app()
