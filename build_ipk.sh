#!/bin/bash
# Build BeLaz IPK
# Usage: ./build_ipk.sh [version] [arch]

VERSION=${1:-0.0.1}
ARCH=${2:-x86_64}
OUTPUT="luci-app-belaz_${VERSION}_${ARCH}.ipk"
SRCDIR="$(dirname "$0")"

echo "Building $OUTPUT..."

rm -rf /tmp/belaz_build
mkdir /tmp/belaz_build
cd /tmp/belaz_build

printf "2.0\n" > debian-binary

mkdir ctrl
cat > ctrl/control << CTRL
Package: luci-app-belaz
Version: $VERSION
Architecture: $ARCH
Maintainer: beit24.ru
Depends: luci-base, uhttpd
Description: BeLaz - AmneziaWG VPN Manager with advanced routing
CTRL
cat > ctrl/postinst << 'POSTINST'
#!/bin/sh
chmod +x /usr/bin/awg-manager-backend /usr/bin/awg-stats-collect
chmod +x /usr/bin/awg-routing /usr/bin/awg-healthcheck
/etc/init.d/awg-manager enable 2>/dev/null
/etc/init.d/awg-manager start 2>/dev/null
/etc/init.d/cron enable 2>/dev/null
/etc/init.d/cron start 2>/dev/null || /etc/init.d/cron restart 2>/dev/null
/etc/init.d/rpcd reload 2>/dev/null
exit 0
POSTINST
chmod +x ctrl/postinst
tar czf control.tar.gz -C ctrl ./control ./postinst

mkdir -p data/www/luci-static/resources/view
mkdir -p data/usr/share/luci/menu.d
mkdir -p data/usr/share/rpcd/acl.d
mkdir -p data/usr/bin
mkdir -p data/etc/cron.d
mkdir -p data/etc/init.d

cp "$SRCDIR/htdocs/luci-static/resources/view/awg-manager.js" data/www/luci-static/resources/view/
cp "$SRCDIR/root/usr/share/luci/menu.d/luci-app-awg-manager.json" data/usr/share/luci/menu.d/
cp "$SRCDIR/root/usr/share/rpcd/acl.d/luci-app-awg-manager.json" data/usr/share/rpcd/acl.d/
cp "$SRCDIR/root/usr/bin/awg-manager-backend" data/usr/bin/
cp "$SRCDIR/root/usr/bin/awg-stats-collect" data/usr/bin/
cp "$SRCDIR/root/usr/bin/awg-routing" data/usr/bin/
cp "$SRCDIR/root/usr/bin/awg-healthcheck" data/usr/bin/
cp "$SRCDIR/root/etc/cron.d/awg-manager" data/etc/cron.d/
cp "$SRCDIR/root/etc/init.d/awg-manager" data/etc/init.d/
chmod +x data/usr/bin/* data/etc/init.d/awg-manager

tar czf data.tar.gz -C data .
tar czf "$OUTPUT" ./debian-binary ./control.tar.gz ./data.tar.gz
cp "$OUTPUT" "$SRCDIR/"
echo "Done: $SRCDIR/$OUTPUT"
