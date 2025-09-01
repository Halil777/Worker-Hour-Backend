# Available Scripts

This project includes several npm scripts to run the server in different modes:

## Development Scripts

- `npm run dev` - Start development server with Telegram bot (default)
- `npm run dev:with-bot` - Start development server with Telegram bot (explicit)
- `npm run dev:no-bot` - Start development server WITHOUT Telegram bot (HTTP API only)

## Production Scripts

- `PORT=7707 npm run start:with-bot`
- `PORT=7709 npm run start:no-bot`
- `npm start` - Build and start production server with Telegram bot (default)
- `npm run start:with-bot` - Build and start production server with Telegram bot (explicit)
- `npm run start:no-bot` - Build and start production server WITHOUT Telegram bot (HTTP API only)

## When to Use Each Mode

### With Bot (Default)

Use `dev` or `start:with-bot` when you need:

- Full Telegram bot functionality
- User registration and linking via Telegram
- Automated notifications and cron jobs
- Complete feature set

### Without Bot (HTTP API Only)

Use `dev:no-bot` or `start:no-bot` when you need:

- Only HTTP API functionality
- Faster startup during development
- Testing without Telegram integration
- Running on servers without bot token access
- Debugging HTTP endpoints in isolation

## Examples

```bash
# Development with bot (full features)
npm run dev

# Development without bot (HTTP API only)
npm run dev:no-bot

# Production with bot
npm run start:with-bot

# Production without bot
npm run start:no-bot
```

## Environment Variables

- `SKIP_BOT_SETUP=true` - Set this to skip Telegram bot initialization
- This is automatically set by the `:no-bot` scripts
