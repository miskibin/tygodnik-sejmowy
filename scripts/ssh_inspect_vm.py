"""SSH inspector + readiness check for mixvm.

Confirms: sudo, disk, docker compose version, current containers, available ports.
"""
from __future__ import annotations

import sys

import paramiko


HOST = "mixvm.bison-fort.ts.net"
USER = "sejm"
PASSWORD = "sejm-stats-2026-!"


def run(client: paramiko.SSHClient, cmd: str, *, sudo: bool = False) -> tuple[int, str, str]:
    if sudo:
        cmd = f"echo {PASSWORD!r} | sudo -S -p '' -- bash -c {cmd!r}"
    stdin, stdout, stderr = client.exec_command(cmd, timeout=60)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    rc = stdout.channel.recv_exit_status()
    return rc, out, err


def main() -> int:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=15, look_for_keys=False, allow_agent=False)

    sections: list[tuple[str, str, bool]] = [
        ("SUDO CHECK", "sudo -n true && echo SUDO_OK || echo SUDO_NEEDS_PW", False),
        ("SUDO WITH PW", "echo SUDO_PW_OK", True),
        ("GROUPS / DOCKER GROUP", "groups; getent group docker", False),
        ("DOCKER VERSION", "docker version --format 'Server: {{.Server.Version}} Client: {{.Client.Version}}' 2>&1", False),
        ("DOCKER COMPOSE", "docker compose version 2>&1", False),
        ("DOCKER PS -A", "docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'", False),
        ("DISK", "df -h / /var /home 2>/dev/null", False),
        ("MEM", "free -h", False),
        ("CPU", "nproc; lscpu | head -5", False),
        ("HOME LS", "ls -la ~/", False),
        ("OPEN PORTS", "ss -tlnp 2>&1 | head -30", True),
        ("EXISTING SUPABASE LIKELY DIRS", "ls -la /opt /srv /data 2>/dev/null; find /home /opt -maxdepth 3 -name 'supabase' 2>/dev/null", False),
        ("PUBLIC IP / HOSTNAMES", "hostname; hostname -I; cat /etc/hosts | head -5", False),
        ("DNS for db.msulawiak.pl", "getent hosts db.msulawiak.pl mixvm.bison-fort.ts.net", False),
    ]

    for title, cmd, sudo in sections:
        print("\n" + "=" * 60 + f"\n{title}\n" + "=" * 60)
        rc, out, err = run(client, cmd, sudo=sudo)
        print(out, end="")
        if err.strip():
            print(f"!!STDERR: {err.strip()}")
        print(f"[rc={rc}]")

    client.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
