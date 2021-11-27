const functions = require("firebase-functions");
const firebase = require("firebase-admin");
const {roundNumber} = require("./bot_start_scene");
const {showCart, cartWizard} = require("./bot_catalog_scene");
const {store, cart} = require("./bot_keyboards.js");
const botConfig = functions.config().env.bot;
const moment = require("moment");
require("moment/locale/ru");
moment.locale("ru");
// orders Handler
const ordersActions = [];
// user orders
const myOrders = async (ctx, next) => {
  if (ctx.state.routeName === "myO") {
    const startAfter = ctx.state.params.get("s");
    const endBefore = ctx.state.params.get("e");
    const userId = + ctx.state.param;
    const inlineKeyboardArray = [];
    const orderId = ctx.state.params.get("oId");
    const objectId = ctx.state.params.get("o");
    let caption = `<b>${botConfig.name} > Мои заказы</b>`;
    if (ctx.session.pathOrderCurrent) {
      const userData = await store.findRecord(`users/${userId}`);
      caption = `Заказы от ${userData.userName}`;
    }
    const limit = 1;
    if (orderId) {
      // const orderSnap = await firebase.firestore().collection("objects").doc(objectId)
      //     .collection("orders").doc(orderId).get();
      // const order = {"id": orderSnap.id, ...orderSnap.data()};
      // get order
      const order = await store.findRecord(`objects/${objectId}/orders/${orderId}`);
      if (order) {
        // show order
        const date = moment.unix(order.createdAt);
        caption += " <b>> " +
        `Заказ #${store.formatOrderNumber(order.userId, order.orderNumber)} (${date.fromNow()})\n` +
        `Склад: ${order.objectName}\n` +
        `Статус: ${store.statuses().get(order.statusId)}\n` +
        `${order.recipientName} ${order.phoneNumber}\n` +
        `Адрес доставки: ${order.address}, ` +
        `${store.carriers().get(order.carrierId)} ` +
        `${order.carrierNumber ? "#" + order.carrierNumber : ""}\n` +
        `Оплата: ${store.payments().get(order.paymentId)}\n` +
        `${order.comment ? "Комментарий: " + order.comment + "\n" : ""}</b>`;
        // order.products.forEach((product) => {
        //   inlineKeyboardArray.push([{text: `${product.name}, ${product.id}`,
        //     callback_data: `p/${product.id}`}]);
        // });
        let totalQty = 0;
        let totalSum = 0;
        // const products = [];
        // for (const [id, product] of Object.entries(order.products)) {
        //   products.push({id, ...product});
        // }
        // // sort products by createdAt
        // products.sort(function(a, b) {
        //   return a.createdAt - b.createdAt;
        // });
        // for (const [index, product] of order.products.entries()) {
        store.sort(order.products).forEach((product, index) => {
          const productTxt = `${index + 1}) ${product.name} (${product.id})` +
        `=${product.price} ${botConfig.currency}*${product.qty}${product.unit}` +
        `=${roundNumber(product.price * product.qty)}${botConfig.currency}`;
          caption += `${productTxt}\n`;
          totalQty += product.qty;
          totalSum += product.qty * product.price;
        });
        caption += `<b>Количество товара: ${totalQty}\n` +
          `Сумма: ${roundNumber(totalSum)} ${botConfig.currency}</b>`;
      }
      inlineKeyboardArray.push([{text: "🧾 Мои заказы",
        callback_data: `${ctx.session.myPathOrder ? ctx.session.myPathOrder : "myO/" + userId}`}]);
    } else {
      // get user info
      // const userInfo = await ctx.state.cart.getUserData();
      // caption += " " + userInfo.userName;
      // show orders
      ctx.session.myPathOrder = ctx.callbackQuery.data;
      const mainQuery = firebase.firestore().collectionGroup("orders").where("userId", "==", userId)
          .orderBy("createdAt", "desc");
      let query = mainQuery;
      if (startAfter) {
        // const startAfterProduct = await firebase.firestore().collection("orders")
        //     .doc(startAfter).get();
        const startAfterProduct = await store.getQuery(`objects/${objectId}/orders/${startAfter}`).get();
        query = query.startAfter(startAfterProduct);
      }
      // prev button
      if (endBefore) {
        // const endBeforeProduct = await firebase.firestore().collection("orders")
        //     .doc(endBefore).get();
        const endBeforeProduct = await store.getQuery(`objects/${objectId}/orders/${endBefore}`).get();
        // set limit
        query = query.endBefore(endBeforeProduct).limitToLast(limit);
      } else {
        // defaul limit
        query = query.limit(limit);
      }
      // get orders
      const ordersSnapshot = await query.get();
      // add orders info
      ordersSnapshot.docs.forEach((doc) => {
        const order = {id: doc.id, ...doc.data()};
        const date = moment.unix(order.createdAt);
        inlineKeyboardArray.push([{text: `🧾 Заказ #${store.formatOrderNumber(order.userId, order.orderNumber)},` +
          `${store.statuses().get(order.statusId)}, ${date.fromNow()}`,
        callback_data: `myO/${userId}?oId=${order.id}&o=${order.objectId}`}]);
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
          prevNext.push({text: "⬅️ Назад",
            callback_data: `myO/${userId}?e=${endBeforeSnap.id}&o=${endBeforeSnap.data().objectId}`});
        }
        // startAfter
        const startAfterSnap = ordersSnapshot.docs[ordersSnapshot.docs.length - 1];
        const ifAfterProducts = await mainQuery.startAfter(startAfterSnap).limit(1).get();
        if (!ifAfterProducts.empty) {
          // startAfter iqual s
          // inlineKeyboardArray.push(Markup.button.callback("➡️ Load more",
          //    `c/${currentCatalog.id}?startAfter=${startAfter.id}&tag=${params.get("tag")}`));
          prevNext.push({text: "➡️ Вперед",
            callback_data: `myO/${userId}?s=${startAfterSnap.id}&o=${startAfterSnap.data().objectId}`});
        }
        inlineKeyboardArray.push(prevNext);
      } else {
        inlineKeyboardArray.push([{text: "У Вас пока нет заказов", callback_data: `myO/${userId}`}]);
      }
      if (ctx.session.pathOrderCurrent) {
        inlineKeyboardArray.push([{text: "🏠 Вернуться к заказу",
          callback_data: `${ctx.session.pathOrderCurrent}`}]);
      }
      inlineKeyboardArray.push([{text: "🏠 Главная", callback_data: "objects"}]);
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
};
// admin orders
const showOrders = async (ctx, next) => {
// show order
  if (ctx.state.routeName === "orders") {
    const startAfter = ctx.state.params.get("s");
    const endBefore = ctx.state.params.get("e");
    const objectId = ctx.state.params.get("o");
    const inlineKeyboardArray = [];
    const orderId = ctx.state.param;
    const limit = 1;
    let caption = `<b>${botConfig.name} > Заказы Admin</b>`;
    if (orderId) {
      // const orderSnap = await firebase.firestore().collection("objects").doc(objectId)
      //     .collection("orders").doc(orderId).get();
      // const order = {"id": orderSnap.id, ...orderSnap.data()};
      const order = await store.findRecord(`objects/${objectId}/orders/${orderId}`);
      if (order) {
        // show order
        ctx.session.pathOrderCurrent = ctx.callbackQuery.data;
        const date = moment.unix(order.createdAt);
        caption = `<b>${botConfig.name} > Заказ #${store.formatOrderNumber(order.userId, order.orderNumber)}` +
        ` (${date.fromNow()})\n` +
        `${order.recipientName} ${order.phoneNumber}\n` +
        `Адрес доставки: ${order.address}, ` +
        `${store.carriers().get(order.carrierId)} ` +
        `${order.carrierNumber ? "#" + order.carrierNumber : ""}\n` +
        `Оплата: ${store.payments().get(order.paymentId)}\n` +
        `${order.comment ? "Комментарий: " + order.comment + "\n" : ""}</b>`;
        // order.products.forEach((product) => {
        //   inlineKeyboardArray.push([{text: `${product.name}, ${product.id}`,
        //     callback_data: `p/${product.id}`}]);
        // });
        let totalQty = 0;
        let totalSum = 0;
        // const products = [];
        // for (const [id, product] of Object.entries(order.products)) {
        //   products.push({id, ...product});
        // }
        // // sort products by createdAt
        // products.sort(function(a, b) {
        //   return a.createdAt - b.createdAt;
        // });
        // for (const [index, product] of products.entries()) {
        //   const productTxt = `${index + 1})${product.name} (${product.id})` +
        // `=${product.price} ${botConfig.currency}*${product.qty}${product.unit}` +
        // `=${roundNumber(product.price * product.qty)}${botConfig.currency}`;
        //   caption += `${productTxt}\n`;
        //   totalQty += product.qty;
        //   totalSum += product.qty * product.price;
        // }
        store.sort(order.products).forEach((product, index) => {
          const productTxt = `${index + 1})${product.name} (${product.id})` +
        `=${product.price} ${botConfig.currency}*${product.qty}${product.unit}` +
        `=${roundNumber(product.price * product.qty)}${botConfig.currency}`;
          caption += `${productTxt}\n`;
          totalQty += product.qty;
          totalSum += product.qty * product.price;
        });
        caption += `<b>Количество товара: ${totalQty}\n` +
          `Сумма: ${roundNumber(totalSum)} ${botConfig.currency}</b>`;
      }
      // edit recipient
      // status
      inlineKeyboardArray.push([{text: `📝 Статус: ${store.statuses().get(order.statusId)}`,
        callback_data: `eO/${order.id}?sSI=${order.statusId}&o=${objectId}`}]);
      inlineKeyboardArray.push([{text: `📝 Получатель: ${order.recipientName}`,
        callback_data: `eO/${order.id}?e=recipientName&o=${objectId}`}]);
      inlineKeyboardArray.push([{text: `📝 Номер тел.: ${order.phoneNumber}`,
        callback_data: `eO/${order.id}?e=phoneNumber&o=${objectId}`}]);
      // payment and currier
      inlineKeyboardArray.push([{text: `📝 Оплата: ${store.payments().get(order.paymentId)}`,
        callback_data: `eO/${order.id}?showPay=${order.paymentId}&o=${objectId}`}]);
      if (order.carrierId === 2) {
        inlineKeyboardArray.push([{text: `📝 Доставка: ${store.carriers().get(order.carrierId)}` +
        `${order.carrierNumber ? " #" + order.carrierNumber : ""}`,
        callback_data: `eO/${order.id}?cId=${order.carrierId}&number=${order.carrierNumber}&o=${objectId}`}]);
      } else {
        inlineKeyboardArray.push([{text: `📝 Доставка: ${store.carriers().get(order.carrierId)}` +
        `${order.carrierNumber ? " #" + order.carrierNumber : ""}`,
        callback_data: `eO/${order.id}?cId=${order.carrierId}&o=${objectId}`}]);
      }
      inlineKeyboardArray.push([{text: `📝 Адрес: ${order.address}`,
        callback_data: `eO/${order.id}?e=address&o=${objectId}`}]);
      inlineKeyboardArray.push([{text: `📝 Комментарий: ${order.comment ? order.comment : ""}`,
        callback_data: `eO/${order.id}?e=comment&o=${objectId}`}]);
      // edit products
      inlineKeyboardArray.push([{text: "📝 Редактировать товары",
        callback_data: `eO/${orderId}?eP=1&o=${objectId}`}]);
      // edit products
      // inlineKeyboardArray.push([{text: "📝 Информация о покупателе",
      //   callback_data: `myO/${order.userId}`}]);
      inlineKeyboardArray.push([{text: "📝 Информация о покупателе",
        callback_data: `eO?userId=${order.userId}&o=${order.objectId}`}]);
      // refresh order
      const dateTimestamp = Math.floor(Date.now() / 1000);
      inlineKeyboardArray.push([{text: `🔄 Обновить заказ#${order.orderNumber}`,
        callback_data: `orders/${order.id}?o=${objectId}&${dateTimestamp}`}]);
      inlineKeyboardArray.push([{text: "🧾 Заказы",
        callback_data: `${ctx.session.pathOrder ? ctx.session.pathOrder : "orders?o=" + order.objectId}`}]);
    } else {
      // show orders
      ctx.session.pathOrderCurrent = null;
      ctx.session.pathOrder = ctx.callbackQuery.data;
      let mainQuery = firebase.firestore().collection("objects").doc(objectId)
          .collection("orders").orderBy("createdAt", "desc");
      // Filter by tag
      const statusId = + ctx.state.params.get("statusId");
      let statusUrl = "";
      if (statusId) {
        mainQuery = mainQuery.where("statusId", "==", statusId);
        statusUrl = `&statusId=${statusId}`;
      }
      let query = mainQuery;
      if (startAfter) {
        // const startAfterProduct = await firebase.firestore().collection("orders")
        //     .doc(startAfter).get();
        const startAfterProduct = await store.getQuery(`objects/${objectId}/orders/${startAfter}`).get();
        query = query.startAfter(startAfterProduct);
      }
      // prev button
      if (endBefore) {
        // const endBeforeProduct = await firebase.firestore().collection("orders")
        //     .doc(endBefore).get();
        const endBeforeProduct = await store.getQuery(`objects/${objectId}/orders/${endBefore}`).get();
        // set limit
        query = query.endBefore(endBeforeProduct).limitToLast(limit);
      } else {
        // defaul limit
        query = query.limit(limit);
      }
      // get orders
      const ordersSnapshot = await query.get();
      // add status button
      const tagsArray = [];
      tagsArray.push({text: "📌 Статус заказа",
        callback_data: `eO/showStatuses?o=${objectId}`});
      // Delete or close selected tag
      if (statusId) {
        tagsArray[0].callback_data = `eO/showStatuses?selectedStatus=${statusId}&o=${objectId}`;
        tagsArray.push({text: `❎ ${store.statuses().get(statusId)}`, callback_data: `orders?o=${objectId}`});
      }
      inlineKeyboardArray.push(tagsArray);
      // add orders info
      ordersSnapshot.docs.forEach((doc) => {
        const order = {id: doc.id, ...doc.data()};
        const date = moment.unix(order.createdAt);
        inlineKeyboardArray.push([{text: `🧾 Заказ #${store.formatOrderNumber(order.userId, order.orderNumber)},` +
          `${store.statuses().get(order.statusId)}, ${date.fromNow()}`,
        callback_data: `orders/${order.id}?o=${objectId}`}]);
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
          prevNext.push({text: "⬅️ Назад",
            callback_data: `orders?e=${endBeforeSnap.id}${statusUrl}&o=${endBeforeSnap.data().objectId}`});
        }
        // startAfter
        const startAfterSnap = ordersSnapshot.docs[ordersSnapshot.docs.length - 1];
        const ifAfterProducts = await mainQuery.startAfter(startAfterSnap).limit(1).get();
        if (!ifAfterProducts.empty) {
          // startAfter iqual s
          // inlineKeyboardArray.push(Markup.button.callback("➡️ Load more",
          //    `c/${currentCatalog.id}?startAfter=${startAfter.id}&tag=${params.get("tag")}`));
          prevNext.push({text: "➡️ Вперед",
            callback_data: `orders?s=${startAfterSnap.id}${statusUrl}&o=${startAfterSnap.data().objectId}`});
        }
        inlineKeyboardArray.push(prevNext);
      } else {
        inlineKeyboardArray.push([{text: "Заказов нет", callback_data: `orders?o=${objectId}`}]);
      }
      inlineKeyboardArray.push([{text: "🏠 Главная", callback_data: "objects"}]);
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
};
ordersActions.push(showOrders);
ordersActions.push(myOrders);

// order wizard
const orderWizard = [
  async (ctx) => {
    ctx.replyWithHTML(`Текущее значение ${ctx.session.fieldName}: <b>${ctx.session.fieldValue}</b>`, {
      reply_markup: {
        keyboard: [["Отмена"]],
        resize_keyboard: true,
      }});
    ctx.session.scene = "editOrder";
    ctx.session.cursor = 1;
  },
  async (ctx) => {
    // save order field
    // validation
    if (ctx.session.fieldName === "recipientName" && ctx.message.text.length < 2) {
      ctx.reply("Имя слишком короткое");
      return;
    }
    if (ctx.session.fieldName === "phoneNumber") {
      const checkPhone = ctx.message.text.match(/^(\+7|7|8)?([489][0-9]{2}[0-9]{7})$/);
      if (!checkPhone) {
        ctx.reply("Введите номер телефона в формате +7YYYXXXXXXX");
        return;
      }
      ctx.message.text = "+7" + checkPhone[2];
    }
    // save new data
    // await ctx.state.cart.saveOrder(ctx.session.orderId, {
    //   [ctx.session.fieldName]: ctx.message.text,
    // });
    await store.updateRecord(`objects/${ctx.session.objectId}/orders/${ctx.session.orderId}`,
        {[ctx.session.fieldName]: ctx.message.text});
    // exit scene
    ctx.reply("Данные сохранены. Обновите заказ!🔄", {
      reply_markup: {
        remove_keyboard: true,
      }});
    ctx.session.scene = null;
  },
];
// edit order fields
ordersActions.push(async (ctx, next) => {
  if (ctx.state.routeName === "eO") {
    const orderId = ctx.state.param;
    const editField = ctx.state.params.get("e");
    const cId = + ctx.state.params.get("cId");
    const carrierNumber = + ctx.state.params.get("number");
    const sCid = + ctx.state.params.get("sCid");
    const showPaymentId = + ctx.state.params.get("showPay");
    const paymentId = + ctx.state.params.get("paymentId");
    const showStatusId = + ctx.state.params.get("sSI");
    const statusId = + ctx.state.params.get("sId");
    const objectId = ctx.state.params.get("o");
    const userId = ctx.state.params.get("userId");
    // show user info creator
    if (userId) {
      const inlineKeyboardArray = [];
      const userData = await store.findRecord(`users/${userId}`);
      inlineKeyboardArray.push([{text: `Заказы ${userData.userName}`,
        callback_data: `myO/${userId}`}]);
      inlineKeyboardArray.push([{text: "⬅️ Назад",
        callback_data: `${ctx.session.pathOrderCurrent ? ctx.session.pathOrderCurrent : `orders?o=${objectId}`}`}]);
      await cartWizard[0](ctx, `${userData.userName}, orderCount: ${userData.orderCount}`, inlineKeyboardArray);
    }
    // edit produc
    const editProducts = ctx.state.params.get("eP");
    const saveProducts = ctx.state.params.get("sP");
    // save products from cart
    if (saveProducts) {
      // const user = await ctx.state.cart.getUserData();
      // const cart = await this.cartQuery(objectId).get();
      const products = await store.findRecord(`objects/${objectId}/carts/${ctx.from.id}`, "products");
      // delete old products
      // await ctx.state.cart.saveOrder(orderId, {
      //   products: firebase.firestore.FieldValue.delete(),
      // });
      // when USE updateRecord delete products not nessesary
      // await store.deleteRecord(`objects/${objectId}/orders/${orderId}`, "products");
      await store.deleteRecord(`users/${ctx.from.id}`, "session.orderData");
      await store.deleteRecord(`objects/${objectId}/carts/${ctx.from.id}`, "products");
      // add new products from cart recipient
      // await ctx.state.cart.saveOrder(orderId, {
      //   products: cart.data().products,
      // });
      await store.updateRecord(`objects/${objectId}/orders/${orderId}`, {products});
      // redirect to order
      ctx.state.routeName = "orders";
      ctx.state.param = orderId;
      await showOrders(ctx, next);
    }
    if (editProducts) {
      // clear cart then export!!!
      const order = await store.findRecord(`objects/${objectId}/orders/${orderId}`);
      await cart.clear(objectId, ctx.from.id);
      // export order to cart
      // await ctx.state.cart.setCartData({
      //   orderData: {
      //     id: order.id,
      //     orderId: order.orderId,
      //     recipientName: order.recipientName,
      //     // phoneNumber: order.phoneNumber,
      //     // paymentId: order.paymentId,
      //     // cId: order.cId,
      //     // carrierNumber: order.carrierNumber ? order.carrierNumber : null,
      //     // address: order.address,
      //     // comment: order.comment ? order.comment : null,
      //   },
      //   products: order.products,
      // });
      await store.updateRecord(`users/${ctx.from.id}`, {"session.orderData": {
        id: order.id,
        orderNumber: order.orderNumber,
        recipientName: order.recipientName,
      }});
      // await store.updateRecord({"users": ctx.from.id}, {"session": {orderData: {
      //   id: order.id,
      //   orderId: order.orderId,
      //   recipientName: order.recipientName,
      //   // phoneNumber: order.phoneNumber,
      //   // paymentId: order.paymentId,
      //   // cId: order.cId,
      //   // carrierNumber: order.carrierNumber ? order.carrierNumber : null,
      //   // address: order.address,
      //   // comment: order.comment ? order.comment : null,
      // }}});
      // await store.createRecord({"objects": objectId, "carts": ctx.from.id}, {products: order.products});
      await store.updateRecord(`objects/${objectId}/carts/${ctx.from.id}`, {products: order.products});
      // set route name
      ctx.state.routeName = "cart";
      await showCart(ctx, next);
    }
    // show statuses
    if (orderId === "showStatuses") {
      const selectedStatus = + ctx.state.params.get("selectedStatus");
      const inlineKeyboardArray = [];
      store.statuses().forEach((value, key) => {
        if (key === selectedStatus) {
          value = "✅ " + value;
        }
        inlineKeyboardArray.push([{text: value, callback_data: `orders?statusId=${key}&o=${objectId}`}]);
      });
      inlineKeyboardArray.push([{text: "⬅️ Назад",
        callback_data: `${ctx.session.pathOrder ? ctx.session.pathOrder : `orders?o=${objectId}`}`}]);
      await cartWizard[0](ctx, "Статуc заказа", inlineKeyboardArray);
    }
    if (editField) {
      // const orderSnap = await firebase.firestore().collection("orders").doc(orderId).get();
      // const order = {"id": orderSnap.id, ...orderSnap.data()};
      const order = await store.findRecord(`objects/${objectId}/orders/${orderId}`);
      ctx.session.orderId = orderId;
      ctx.session.objectId = objectId;
      ctx.session.fieldName = editField;
      ctx.session.fieldValue = order[editField];
      orderWizard[0](ctx);
    }
    // show payment
    if (showPaymentId) {
      const inlineKeyboardArray = [];
      store.payments().forEach((value, key) => {
        if (key === showPaymentId) {
          value = "✅ " + value;
        }
        inlineKeyboardArray.push([{text: value, callback_data: `eO/${orderId}?paymentId=${key}&o=${objectId}`}]);
      });
      inlineKeyboardArray.push([{text: "⬅️ Назад",
        callback_data: `orders/${orderId}?o=${objectId}`}]);
      await cartWizard[0](ctx, "Способ оплаты", inlineKeyboardArray);
    }
    // save payment
    if (paymentId) {
      // await ctx.state.cart.saveOrder(orderId, {
      //   paymentId,
      // });
      await store.updateRecord(`objects/${objectId}/orders/${orderId}`, {paymentId});
      ctx.state.routeName = "orders";
      // ctx.state.param = orderId;
      await showOrders(ctx, next);
    }
    // show carrier
    if (cId) {
      const inlineKeyboardArray = [];
      store.carriers().forEach((value, key) => {
        if (key === cId) {
          value = "✅ " + value;
        }
        if (key === 1) {
          inlineKeyboardArray.push([{text: value, callback_data: `eO/${orderId}?sCid=${key}&o=${objectId}`}]);
        } else {
          inlineKeyboardArray.push([{text: value,
            callback_data: `cO/cN?cId=${key}&oId=${orderId}&o=${objectId}`}]);
        }
      });
      inlineKeyboardArray.push([{text: "⬅️ Назад",
        callback_data: `orders/${orderId}?o=${objectId}`}]);
      await cartWizard[0](ctx, "Способ доставки", inlineKeyboardArray);
    }
    // save carrier
    if (sCid) {
      // await ctx.state.cart.saveOrder(orderId, {
      //   carrierId: sCid,
      // });
      await store.updateRecord(`objects/${objectId}/orders/${orderId}`, {carrierId: sCid});
      // carrierNumber = Number(carrierNumber);
      if (sCid === 2 && !carrierNumber) {
        // return first step error
        ctx.state.params.set("oId", orderId);
        ctx.state.params.set("cId", sCid);
        await cartWizard[1](ctx, "errorCurrierNumber");
        return;
      }
      if (carrierNumber) {
        // await ctx.state.cart.saveOrder(orderId, {
        //   carrierNumber,
        // });
        await store.updateRecord(`objects/${objectId}/orders/${orderId}`, {carrierNumber});
      } else {
        // await ctx.state.cart.saveOrder(orderId, {
        //   carrierNumber: null,
        // });
        await store.updateRecord(`objects/${objectId}/orders/${orderId}`, {carrierNumber: null});
      }
      // redirect to order
      ctx.state.routeName = "orders";
      // ctx.state.param = orderId;
      await showOrders(ctx, next);
    }
    // show status
    if (showStatusId) {
      const inlineKeyboardArray = [];
      store.statuses().forEach((value, key) => {
        if (key === showStatusId) {
          value = "✅ " + value;
        }
        inlineKeyboardArray.push([{text: value, callback_data: `eO/${orderId}?sId=${key}&o=${objectId}`}]);
      });
      inlineKeyboardArray.push([{text: "⬅️ Назад",
        callback_data: `orders/${orderId}`}]);
      await cartWizard[0](ctx, "Статус заказа", inlineKeyboardArray);
    }
    // save status
    if (statusId) {
      // await ctx.state.cart.saveOrder(orderId, {
      //   statusId,
      // });
      await store.updateRecord(`objects/${objectId}/orders/${orderId}`, {statusId});
      // redirect to order
      ctx.state.routeName = "orders";
      // ctx.state.param = orderId;
      // ctx.state.params.set("o") = objectId;
      await showOrders(ctx, next);
    }
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

exports.ordersActions = ordersActions;
exports.orderWizard = orderWizard;
