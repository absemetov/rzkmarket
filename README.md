# rzk-market-ua

## Build Setup

```bash
# restart aws site
$ pm2 restart index
# projects list
$ yarn pl

# serve frontend
$ yarn --cwd functions/ parcel-s
$ yarn --cwd functions/ vite

# serve functions
$ yarn s-f
# serve functions and firestore
$ yarn s-ff
# serve functions and hosting
$ yarn s-fh
# serve functions firestore and hosting
$ yarn s-ffh
# generate sitemap file
$ node functions/sites/rzk.com.ru/sitemap.js ua sitemap
# generate robots file
$ node functions/sites/rzk.com.ru/sitemap.js ua robots
# generate robots file
$ node functions/sites/rzk.com.ru/sitemap.js ua merchant
# build for production and launch server
$ yarn --cwd functions/ parcel-b
$ yarn --cwd functions/ vite-b
$ yarn deploy-site-*
$ yarn deploy-bot-*
$ yarn deploy-triggers-*
```

For detailed explanation on how things work, check out [RZK Маркет Україна](https://rzk.com.ua).
Telegram bot [@RzkMarketBot](https://t.me/RzkMarketBot)
Кожну другу розетку в Україні куплять у нас!
З усіх питань звертайтеся до [@absemetov](https://t.me/absemetov)
