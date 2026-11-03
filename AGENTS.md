<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Проект «Оборот CRM» — соглашения для разработки

Стек: Next.js 16 (App Router, `cacheComponents: false`), React 19, TypeScript strict, Tailwind v4 (токены в `src/app/globals.css`), Drizzle ORM + SQLite (`@libsql/client`, файл `data/crm.db`), схема в `src/db/schema.ts`.

- Все страницы приложения лежат в `src/app/(app)/<раздел>/…` и наследуют layout с сайдбаром. Ставь `export const dynamic = "force-dynamic"` на страницы с данными.
- Данные читаем в серверных компонентах напрямую через `db` (`import { db, schema } from "@/db"`). Мутации — серверные функции (`"use server"`) в файле `actions.ts` рядом со страницей; в каждой серверной функции первой строкой `const user = await requireUser()` и проверка прав через `can(user.actor, "<entity>", "<action>")` из `@/lib/permissions`.
- Скрытые/только для чтения поля роли: `hiddenFields`/`readonlyFields`/`maskFields` из `@/lib/permissions`. Область видимости записей: `scopeOf`/`canRecord`.
- UI-кит: `@/components/ui/{button,input,badge,card,avatar,dialog,tabs,switch,dropdown,page,table,tooltip}`. Используй `PageHeader`, `Section`, `Stat`, `EmptyState`, `Table` (класс `table-base`), `Badge` с тонами. Иконки — `lucide-react`. Уведомления — `toast` из `sonner`. Деньги/даты — `@/lib/format`.
- Клиентские компоненты (`"use client"`) только там, где нужна интерактивность; данные им передаём пропсами из серверной страницы.
- События системы: `emit("<событие>", payload)` из `@/lib/events` — вызывать после создания сделки/заявки (`lead.created`, `deal.created`), смены этапа (`deal.stage_changed`, `deal.won`, `deal.lost`), оплаты (`payment.received`), записи (`booking.created`), входящего сообщения (`message.received`), пропущенного звонка (`call.missed`).
- Интеграции — `@/lib/integrations/*` (messaging, sms, email, telephony, company-data, product-data, sbp, bank, edo, finance, metrika, ai). Локализация — Узбекистан при русском языке интерфейса: валюта «сум» (только через `fmtMoney`/`fmtMoneyFull`, никаких «₽» в JSX), НДС 12%, реквизиты ИНН / ОКЭД / Рег. номер / МФО / Расчётный счёт (20 цифр), документ «ЭСФ» (не УПД), оплата «Payme / Click» (значение `payments.method = "sbp"` сохраняется, подпись в UI — Payme/Click), ЭДО — Didox / Faktura.uz, банки — Капиталбанк, Hamkorbank, Ipoteka Bank, Uzum Bank, TBC Bank, финучёт — 1С для Узбекистана / SmartUp / Hisobchi, SMS — Eskiz / Playmobile, телефония — OnlinePBX / Sipuni, данные компаний — реестр ЮЛ (soliq.uz), мессенджеры — Telegram, WhatsApp, Instagram (канал `instagram`, иконка `InstagramIcon` из `@/components/ui/instagram-icon`, цвет #E1306C), MAX; аналитика — Яндекс Метрика и Google Analytics. Телефоны в плейсхолдерах — `+998 90 123-45-67`, города в примерах — Ташкент, Самарканд, Бухара, часовой пояс — `Asia/Tashkent` (`TZ` из `@/lib/format`). Документы — `@/lib/documents/service` (`createDocument`, `sendDocument`, `createClientReport`, `documentBytes`). Передача между воронками — `@/lib/handoff`. Распределение заявок — `@/lib/distribution`. Слоты календаря — `@/lib/calendar`. Журнал — `logActivity` из `@/lib/activity`. Настройки — `getSetting/setSetting` из `@/lib/settings`.
- Язык интерфейса — русский, тон: коротко, по делу, глаголы в кнопках («Выставить счёт», «Отправить в ЭДО»). Никаких заглушек «TODO» в интерфейсе: каждая кнопка должна что-то делать.
- Дизайн: светлая тема, акцентный красный `accent` только для важных статусов/«печатей», основная кнопка чёрная (`variant="primary"`), табличные цифры `tnum`. Не плодить карточки с тенями — секции с тонкой рамкой.
- Проверка: `npx tsc --noEmit` должен проходить без ошибок по твоим файлам.
