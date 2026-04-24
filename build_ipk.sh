#!/bin/bash
VERSION=${1:-0.2.3}
ARCH=${2:-x86_64}
OUTPUT="luci-app-belaz_${VERSION}_${ARCH}.ipk"
SRCDIR="$(dirname "$0")"
echo "Building $OUTPUT..."
rm -rf /tmp/belaz_build && mkdir /tmp/belaz_build && cd /tmp/belaz_build
printf "2.0\n" > debian-binary
mkdir ctrl
cat > ctrl/control << CTRL
Package: luci-app-belaz
Version: $VERSION
Architecture: $ARCH
Maintainer: beit24.ru
Depends: luci-base, uhttpd, ip-full, sing-box
Description: BeLaz - AmneziaWG VPN Manager with advanced routing
CTRL
cat > ctrl/postinst << 'POSTINST'
#!/bin/sh
chmod 755 /usr/bin/awg-manager-backend /usr/bin/awg-routing /usr/bin/awg-healthcheck /usr/bin/singbox-healthcheck
# Check optional dependencies
which awg > /dev/null 2>&1 || logger -t belaz "WARNING: amneziawg-tools not installed - AWG servers will not work"
which sing-box > /dev/null 2>&1 || logger -t belaz "WARNING: sing-box not installed - VLESS exit nodes will not work"
which ip > /dev/null 2>&1 || logger -t belaz "WARNING: ip-full not installed - routing will not work"
chmod 644 /www/luci-static/resources/view/awg-manager.js
chmod 644 /usr/share/luci/menu.d/luci-app-awg-manager.json
chmod 644 /usr/share/rpcd/acl.d/luci-app-awg-manager.json
/etc/init.d/awg-manager enable 2>/dev/null
/etc/init.d/awg-manager start 2>/dev/null
/etc/init.d/cron enable 2>/dev/null
/etc/init.d/cron start 2>/dev/null || /etc/init.d/cron restart 2>/dev/null
mkdir -p /etc/awg-manager
[ -f /etc/awg-manager/healthcheck_singbox_config.json ] || printf '{"disabled":false,"max_latency":2000,"min_success":3,"max_fail":3,"ip_check_url":"http://cp.cloudflare.com","delay_timeout":5000}' > /etc/awg-manager/healthcheck_singbox_config.json
[ -f /etc/awg-manager/healthcheck_config.json ] || printf '{"disabled":false,"max_latency":500,"max_loss":10,"min_success":6,"max_fail":3,"ping_count":5,"tunnel_targets":["8.8.8.8","9.9.9.9"]}' > /etc/awg-manager/healthcheck_config.json
/etc/init.d/rpcd reload 2>/dev/null
exit 0
POSTINST
chmod +x ctrl/postinst
tar czf control.tar.gz -C ctrl ./control ./postinst
mkdir -p data/www/luci-static/resources/view data/usr/share/luci/menu.d data/usr/share/rpcd/acl.d
mkdir -p data/usr/bin data/etc/crontabs data/etc/init.d
cp "$SRCDIR/htdocs/luci-static/resources/view/awg-manager.js" data/www/luci-static/resources/view/
cp "$SRCDIR/root/usr/share/luci/menu.d/luci-app-awg-manager.json" data/usr/share/luci/menu.d/
cp "$SRCDIR/root/usr/share/rpcd/acl.d/luci-app-awg-manager.json" data/usr/share/rpcd/acl.d/
cp "$SRCDIR/root/usr/bin/awg-manager-backend" data/usr/bin/
cp "$SRCDIR/root/usr/bin/awg-routing" data/usr/bin/
cp "$SRCDIR/root/usr/bin/awg-healthcheck" data/usr/bin/
cp "$SRCDIR/root/usr/bin/singbox-healthcheck" data/usr/bin/
cp "$SRCDIR/root/etc/crontabs/root" data/etc/crontabs/
cp "$SRCDIR/root/etc/init.d/awg-manager" data/etc/init.d/
chmod +x data/usr/bin/* data/etc/init.d/awg-manager
tar czf data.tar.gz -C data .
tar czf "$OUTPUT" ./debian-binary ./control.tar.gz ./data.tar.gz
cp "$OUTPUT" "$SRCDIR/"
echo "Done: $SRCDIR/$OUTPUT"
