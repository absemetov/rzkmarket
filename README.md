# rzk-market-ua

## Build Setup

```bash
# projects list
$ yarn pl

# serve frontend
$ yarn --cwd functions/ parcel-s

# serve functions
$ yarn s-f
# serve functions and firestore
$ yarn s-ff
# serve functions and hosting
$ yarn s-fh
# serve functions firestore and hosting
$ yarn s-ffh
# start bot
$ curl http://localhost:5001/rzk-warsaw-dev/europe-central2/bot
# generate sitemap file
$ node functions/sites/rzk.com.ru/sitemap.js env
# build for production and launch server
$ yarn --cwd functions/ parcel-b
$ yarn deploy-site-*
$ yarn deploy-bot-*
$ yarn deploy-triggers-*
```

For detailed explanation on how things work, check out [RZK Маркет Україна](https://rzk.com.ua).
Telegram bot [@RzkMarketBot](https://t.me/RzkMarketBot)
Кожну другу розетку в Україні куплять у нас!
З усіх питань звертайтеся до [@absemetov](https://t.me/absemetov)
