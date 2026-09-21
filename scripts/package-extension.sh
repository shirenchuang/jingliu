#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
extension_dir="$project_root/extension"
version="$(node -p "require('$extension_dir/manifest.json').version")"
archive_name="jingliu-v${version}.zip"
output_dir="$project_root/dist"
website_downloads="$project_root/website/downloads"

mkdir -p "$output_dir" "$website_downloads"

(
  cd "$extension_dir"
  zip -qrFS "$output_dir/$archive_name" \
    manifest.json \
    background.js shared.js core.js \
    popup.html popup.css popup.js \
    options.html options.css options.js \
    content icons
)

cp "$output_dir/$archive_name" "$website_downloads/$archive_name"

echo "Created $output_dir/$archive_name"
shasum -a 256 "$output_dir/$archive_name"
