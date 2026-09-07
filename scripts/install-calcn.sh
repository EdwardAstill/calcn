#!/bin/sh
set -eu

if [ "$(uname -s)" != Linux ]; then
    echo 'Use the macOS or Windows installer for your platform.' >&2
    exit 1
fi
if [ "$#" -ne 1 ] || [ ! -f "$1" ]; then
    echo 'Usage: sh install-calcn.sh /path/to/calcn.AppImage' >&2
    exit 1
fi

bin_directory="$HOME/.local/bin"
data_directory="${XDG_DATA_HOME:-$HOME/.local/share}"
case "$data_directory" in
    /*) ;;
    *) echo 'XDG_DATA_HOME must be an absolute path.' >&2; exit 1 ;;
esac
executable="$bin_directory/calcn"
applications="$data_directory/applications"
mkdir -p "$bin_directory" "$applications"
temporary_executable=$(mktemp "$bin_directory/.calcn.XXXXXX")
trap 'rm -f "$temporary_executable"' EXIT HUP INT TERM
cp -- "$1" "$temporary_executable"
chmod 755 "$temporary_executable"
mv -f -- "$temporary_executable" "$executable"

# Desktop Exec quoting has its own escaping rules; it is not shell syntax.
exec_path=$(printf '%s' "$executable" | sed 's/\\/\\\\\\\\/g; s/"/\\\\"/g; s/`/\\\\`/g; s/\$/\\\\$/g; s/%/%%/g')
cat > "$applications/calcn.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=calcn
Comment=Scientific calculator with symbolic algebra, calculus, and plots
Exec="$exec_path"
Terminal=false
Categories=Education;Math;
Keywords=calculator;algebra;calculus;plot;
StartupWMClass=calcn
DESKTOP
chmod 644 "$applications/calcn.desktop"
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$applications" || true
fi
printf 'Installed %s and its application-menu entry.\n' "$executable"
