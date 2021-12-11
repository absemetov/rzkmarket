const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const app = express();
// const serviceAccount = require("./rzk-warsaw-ru-firebase-adminsdk-nzfp6-0e594387ad.json");
// Initialize Firebase
// const rzkWarsawRu = admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
// }, "warsaw");
// main route
app.get("/", async (req, res) => {
  const objectSnap = await admin.firestore().collection("objects").doc("absemetov").get();
  const object = {"id": objectSnap.id, ...objectSnap.data()};
  res.send(`
  <!doctype html>
  <html lang="ru">
    <head>
      <!-- Required meta tags -->
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <!-- Bootstrap CSS -->
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css"
      rel="stylesheet" integrity="sha384-1BmE4kWBq78iYhFldvKuhfTAU6auU8tT94WrHftjDbrCEXSU1oBoqyl2QvZ6jIW3"
      crossorigin="anonymous">
      <title>Интернет-магазин RZK Market Крым: купить элетротовары, кабель, провод, автоматика, лампы в Крыму</title>
      <meta name="description" content="Интернет-магазин RZK Маркет Крым: кабель, провод, розетки, выключатели,
      автоматика. ✓ Доставка по всему Крыму $ Выгодные цены и скидки %">
      <meta name="keywords" content="rzk маркет крым, rzk, надир абсеметов">
      <meta name="robots" content="index,follow">
    </head>
    <body>
      <h1>Купить электротовары оптом и в розницу. Склады Симферополь, Саки</h1>
      <h1><a href="tel:+79788986431">+7 978 89 86 431</a></h1>
      <h1>Заказ можно оформить через Telegram Bot <a href="//t.me/RzkCrimeaBot?start=fromsite">
      https://t.me/RzkCrimeaBot</a></h1>
      <h2>${object.id} ${object.name}</h2>
      <!-- Optional JavaScript; choose one of the two! -->

      <!-- Option 1: Bootstrap Bundle with Popper -->
      <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js"
      integrity="sha384-ka7Sk0Gln4gmtz2MlQnikT1wXgYsOg+OMhuP+IlRH9sENBO0LRn5q+8nbTov4+1p"
      crossorigin="anonymous"></script>

      <!-- Option 2: Separate Popper and Bootstrap JS -->
      <!--
      <script src="https://cdn.jsdelivr.net/npm/@popperjs/core@2.10.2/dist/umd/popper.min.js"
      integrity="sha384-7+zCNj/IqJ95wo16oMtfsKbZ9ccEh31eOz1HGyDuCQ6wgnyJNSYdrPa03rtR1zdB"
      crossorigin="anonymous"></script>
      <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.min.js"
      integrity="sha384-QJHtvGhmr9XOIpI6YVutG+2QOK9T+ZnN4kzFN1RtK3zEFEIsxhlmWl5/YESvpZ13"
      crossorigin="anonymous"></script>
      -->
    </body>
  </html>`);
});

exports.express = functions.https.onRequest(app);
