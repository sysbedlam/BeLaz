# BeLaz — VPN Manager для OpenWrt

Веб-интерфейс LuCI для управления VPN-инфраструктурой на роутере. Поддерживает несколько входных серверов AmneziaWG, гибкую маршрутизацию трафика через выходные ноды (AWG и VLESS), мониторинг состояния нод и управление клиентами.

> ⚠️ Проект находится в активной разработке. Тестировался на OpenWrt 24.10.x, установленном на VPS (x86_64).

---

## Возможности

**Входные серверы (AWG)**
- Создание и удаление серверов AmneziaWG
- Управление клиентами — добавление, удаление, QR-код, статистика трафика
- Автоматическая генерация ключей и параметров обфускации

**Выходные ноды**
- AWG-ноды — загрузка из `.conf` файла клиентского конфига
- VLESS-ноды — добавление по ссылке `vless://`, автоматическая настройка sing-box
- Мониторинг статуса и латентности каждой ноды в реальном времени

**Маршрутизация**
- **Cascade** — весь трафик сервера через конкретную ноду
- **Balance** — балансировка нагрузки между нодами с весами
- **Failover** — автоматическое переключение при падении ноды
- **Policy rules** — маршрутизация по спискам IP/доменов (например, Telegram всегда через Финляндию)
- **Address Lists** — управление списками для policy rules

**Health Check**
- AWG-ноды: ping через туннель, контроль потерь и латентности
- VLESS-ноды: реальная latency через Clash API (sing-box)
- Независимые настройки для AWG и VLESS
- Автоматическое восстановление нод после сбоя

---

## Требования

- OpenWrt 24.10.x (x86_64)
- `amneziawg-tools` — устанавливается вручную (нет в официальных репозиториях)
- `sing-box` — устанавливается из официальных репозиториев OpenWrt
- `ip-full` — устанавливается из официальных репозиториев OpenWrt

---

## Установка

### 1. Установка OpenWrt на VPS

Инструкция по установке OpenWrt на VPS: [beit24.ru/blog/openwrt-on-vps.php](http://beit24.ru/blog/openwrt-on-vps.php)

### 2. Установка зависимостей

```bash
opkg update
opkg install ip-full sing-box
```

`amneziawg-tools` устанавливается через скрипт от [@Slava-Shchipunov](https://github.com/Slava-Shchipunov/awg-openwrt):

```bash
sh <(wget -O - https://raw.githubusercontent.com/Slava-Shchipunov/awg-openwrt/refs/heads/master/amneziawg-install.sh)
```

### 3. Установка BeLaz

Скачайте актуальный `.ipk` файл со [страницы релизов](https://github.com/sysbedlam/BeLaz/releases) и установите:

```bash
opkg install luci-app-belaz_*.ipk
```

После установки перейдите в LuCI → **Services → BeLaz**.

---

## Структура проекта

```
belaz/
├── build_ipk.sh                          # Скрипт сборки .ipk пакета
├── htdocs/luci-static/resources/view/
│   └── awg-manager.js                    # Фронтенд LuCI
└── root/
    ├── usr/bin/
    │   ├── awg-manager-backend           # Бэкенд (UCI, конфиги, ключи)
    │   ├── awg-routing                   # Управление IP rules и таблицами маршрутизации
    │   ├── awg-healthcheck               # Мониторинг AWG нод
    │   └── singbox-healthcheck           # Мониторинг VLESS нод через Clash API
    ├── etc/
    │   ├── crontabs/root                 # Расписание healthcheck
    │   └── init.d/awg-manager            # Автозапуск маршрутизации
    └── usr/share/
        ├── luci/menu.d/                  # Меню LuCI
        └── rpcd/acl.d/                   # Права доступа rpcd
```

---

## Сборка из исходников

```bash
git clone https://github.com/sysbedlam/BeLaz.git
cd BeLaz
bash build_ipk.sh 0.7.2
```

---

## Конфигурационные файлы

Все данные хранятся в `/etc/awg-manager/`:

| Файл | Описание |
|------|----------|
| `routing.json` | Правила маршрутизации (cascade, balance, policy) |
| `exitnodes.json` | Реестр выходных нод |
| `healthcheck.json` | Текущий статус нод |
| `healthcheck_history.json` | История проверок (счётчики) |
| `healthcheck_config.json` | Настройки healthcheck для AWG |
| `healthcheck_singbox_config.json` | Настройки healthcheck для VLESS |
| `indexes.json` | Индексы серверов для routing tables |

---

## Известные ограничения

- Тестировалось только на x86_64 VPS
- `amneziawg-tools` требует ручной установки
- VLESS ноды требуют установленного `sing-box`

---

## Благодарности

- **[Slava Shchipunov](https://github.com/Slava-Shchipunov/awg-openwrt)** — за скрипт установки amneziawg-tools на OpenWrt, без которого BeLaz не работает
- **[itdog / podkop](https://github.com/itdoginfo/podkop)** — за вдохновение и идеи по работе с sing-box и маршрутизацией на OpenWrt

---

## Лицензия

MIT
