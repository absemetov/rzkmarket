const firebase = require("firebase-admin");
const {botConfig, roundNumber} = require("./bot_start_scene");
const {showCart} = require("./bot_catalog_scene");
const moment = require("moment");
require("moment/locale/ru");
moment.locale("ru");
// orders Handler
const ordersActions = [];
ordersActions.push(async (ctx, next) => {
// show order
  if (ctx.state.routeName === "orders") {
    const startAfter = ctx.state.params.get("s");
    const endBefore = ctx.state.params.get("e");
    let path = "";
    if (startAfter) {
      path = `s=${startAfter}`;
    }
    if (endBefore) {
      path = `e=${endBefore}`;
    }
    const inlineKeyboardArray = [];
    const orderId = ctx.state.param;
    let caption = `<b>${botConfig.name} > Заказы</b>`;
    if (orderId) {
      const editOrder = ctx.state.params.get("edit");
      const orderSnap = await firebase.firestore().collection("orders").doc(orderId).get();
      if (orderSnap.exists) {
        const order = {"id": orderSnap.id, ...orderSnap.data()};
        // edit order
        if (editOrder) {
          // clear cart then export!!!
          await ctx.state.cart.clear();
          // export order to cart
          await ctx.state.cart.setData({
            cart: {
              orderData: {
                id: order.id,
                orderId: order.orderId,
                recipientName: order.recipientName,
                phoneNumber: order.phoneNumber,
                paymentId: order.paymentId,
                carrierId: order.carrierId,
                carrierNumber: order.carrierNumber ? order.carrierNumber : null,
                address: order.address,
                comment: order.comment ? order.comment : null,
                path,
              },
              products: order.products,
            },
          });
          // set route name
          ctx.state.routeName = "cart";
          await showCart(ctx, next);
          return;
        }
        // show order
        const date = moment.unix(order.createdAt);
        caption = `<b>${botConfig.name} > Заказ #${order.orderId} (${date.fromNow()})\n` +
        `${order.recipientName} ${order.phoneNumber}\n` +
        `${order.address}, ` +
        `${order.carrierId === 1 ? "Нова Пошта" : "Міст єкспрес"} ` +
        `${order.carrierNumber ? "#" + order.carrierNumber : ""}\n` +
        `${order.comment ? order.comment + "\n" : ""}</b>`;
        // order.products.forEach((product) => {
        //   inlineKeyboardArray.push([{text: `${product.name}, ${product.id}`,
        //     callback_data: `p/${product.id}`}]);
        // });
        let totalQty = 0;
        let totalSum = 0;
        const products = [];
        for (const [id, product] of Object.entries(order.products)) {
          products.push({id, ...product});
        }
        // sort products by createdAt
        products.sort(function(a, b) {
          return a.createdAt - b.createdAt;
        });
        for (const [index, product] of products.entries()) {
          const productTxt = `${index + 1})${product.name} (${product.id})` +
        `=${product.price} ${botConfig.currency}*${product.qty}${product.unit}` +
        `=${roundNumber(product.price * product.qty)}${botConfig.currency}`;
          caption += `${productTxt}\n`;
          totalQty += product.qty;
          totalSum += product.qty * product.price;
        }
        if (totalQty) {
          caption += `<b>Количество товара: ${totalQty}\n` +
          `Сумма: ${roundNumber(totalSum)} ${botConfig.currency}</b>`;
        }
      }
      inlineKeyboardArray.push([{text: "📝 Редактировать", callback_data: `orders/${orderId}?edit=1&${path}`}]);
      inlineKeyboardArray.push([{text: "🧾 Заказы", callback_data: `orders?${path}`}]);
    } else {
      // show orders
      const limit = 10;
      const mainQuery = firebase.firestore().collection("orders").orderBy("createdAt", "desc");
      let query = mainQuery;
      if (startAfter) {
        const startAfterProduct = await firebase.firestore().collection("orders")
            .doc(startAfter).get();
        query = query.startAfter(startAfterProduct);
      }
      // prev button
      if (endBefore) {
        const endBeforeProduct = await firebase.firestore().collection("orders")
            .doc(endBefore).get();
          // set limit
        query = query.endBefore(endBeforeProduct).limitToLast(limit);
      } else {
        // defaul limit
        query = query.limit(limit);
      }
      // get Products
      const ordersSnapshot = await query.get();
      ordersSnapshot.docs.forEach((doc) => {
        const order = {id: doc.id, ...doc.data()};
        const date = moment.unix(order.createdAt);
        inlineKeyboardArray.push([{text: `🧾 Заказ #${order.orderId}, ${date.fromNow()}`,
          callback_data: `orders/${order.id}?${path}`}]);
      });
      // Set load more button
      if (!ordersSnapshot.empty) {
        const prevNext = [];
        // endBefore prev button e paaram
        const endBeforeSnap = ordersSnapshot.docs[0];
        const ifBeforeProducts = await mainQuery.endBefore(endBeforeSnap).limitToLast(1).get();
        if (!ifBeforeProducts.empty) {
          // inlineKeyboardArray.push(Markup.button.callback("⬅️ Back",
          //    `c/${currentCatalog.id}?endBefore=${endBefore.id}&tag=${params.get("tag")}`));
          prevNext.push({text: "⬅️ Назад", callback_data: `orders?e=${endBeforeSnap.id}`});
        }
        // startAfter
        const startAfterSnap = ordersSnapshot.docs[ordersSnapshot.docs.length - 1];
        const ifAfterProducts = await mainQuery.startAfter(startAfterSnap).limit(1).get();
        if (!ifAfterProducts.empty) {
          // startAfter iqual s
          // inlineKeyboardArray.push(Markup.button.callback("➡️ Load more",
          //    `c/${currentCatalog.id}?startAfter=${startAfter.id}&tag=${params.get("tag")}`));
          prevNext.push({text: "➡️ Вперед",
            callback_data: `orders?s=${startAfterSnap.id}`});
        }
        inlineKeyboardArray.push(prevNext);
      }
      inlineKeyboardArray.push([{text: "🏠 Главная", callback_data: "start"}]);
    }
    // truncate long string
    if (caption.length > 1024) {
      caption = caption.substring(0, 1024);
    }
    await ctx.editMessageMedia({
      type: "photo",
      media: "https://picsum.photos/450/150/?random",
      caption,
      parse_mode: "html",
    }, {
      reply_markup: {
        inline_keyboard: inlineKeyboardArray,
      },
    });
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

exports.ordersActions = ordersActions;
