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
    let pathOrder = "";
    if (startAfter) {
      pathOrder = `s=${startAfter}`;
    }
    if (endBefore) {
      pathOrder = `e=${endBefore}`;
    }
    ctx.session.pathOrder = pathOrder;
    const inlineKeyboardArray = [];
    const orderId = ctx.state.param;
    let caption = `<b>${botConfig.name} > Заказы</b>`;
    if (orderId) {
      const editOrder = ctx.state.params.get("edit");
      const saveOrder = ctx.state.params.get("save");
      // save products from cart
      if (saveOrder === "products") {
        const user = await ctx.state.cart.getUserData();
        // save order
        await ctx.state.cart.saveOrder(orderId, {
          products: firebase.firestore.FieldValue.delete(),
        });
        // add new products from cart recipient
        await ctx.state.cart.saveOrder(orderId, {
          products: user.cart.products,
        });
      }
      const orderSnap = await firebase.firestore().collection("orders").doc(orderId).get();
      const order = {"id": orderSnap.id, ...orderSnap.data()};
      if (orderSnap.exists) {
        // edit order
        if (editOrder === "products") {
          // clear cart then export!!!
          await ctx.state.cart.clear();
          // export order to cart
          await ctx.state.cart.setCartData({
            orderData: {
              id: order.id,
              orderId: order.orderId,
              recipientName: order.recipientName,
              // phoneNumber: order.phoneNumber,
              // paymentId: order.paymentId,
              // carrierId: order.carrierId,
              // carrierNumber: order.carrierNumber ? order.carrierNumber : null,
              // address: order.address,
              // comment: order.comment ? order.comment : null,
            },
            products: order.products,
          });
          // set route name
          ctx.state.routeName = "cart";
          await showCart(ctx, next);
          return;
        } else {
          // wizard order
        }
        // show order
        const date = moment.unix(order.createdAt);
        caption = `<b>${botConfig.name} > Заказ #${order.orderId} (${date.fromNow()})\n` +
        `${order.recipientName} ${order.phoneNumber}\n` +
        `Адрес доставки: ${order.address}, ` +
        `${order.carrierId === 1 ? "Нова Пошта" : "Міст єкспрес"} ` +
        `${order.carrierNumber ? "#" + order.carrierNumber : ""}\n` +
        `Оплата: ${order.paymentId === 1 ? "ПриватБанк" : "monobank"}\n` +
        `${order.comment ? "Комментарий: " + order.comment + "\n" : ""}</b>`;
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
      // edit recipient
      inlineKeyboardArray.push([{text: `📝 Получатель: ${order.recipientName}`,
        callback_data: `editOrder/${order.id}?edit=recipientName`}]);
      inlineKeyboardArray.push([{text: `📝 Номер тел.: ${order.phoneNumber}`,
        callback_data: `editOrder/${order.id}?edit=phoneNumber`}]);
      // payment
      inlineKeyboardArray.push([{text: `📝 Оплата: ${order.paymentId === 1 ? "ПриватБанк" : "monobank"}`,
        callback_data: `editOrder/${order.id}?edit=address`}]);
      inlineKeyboardArray.push([{text: `📝 Адрес: ${order.address}`,
        callback_data: `editOrder/${order.id}?edit=address`}]);
      inlineKeyboardArray.push([{text: `📝 Комментарий: ${order.comment ? order.comment : ""}`,
        callback_data: `editOrder/${order.id}?edit=comment`}]);
      // edit products
      inlineKeyboardArray.push([{text: "📝 Редактировать товары",
        callback_data: `orders/${orderId}?edit=products`}]);
      // refresh order
      const dateTimestamp = Math.floor(Date.now() / 1000);
      inlineKeyboardArray.push([{text: `🔄 Обновить заказ#${order.orderId}`,
        callback_data: `orders/${order.id}?${dateTimestamp}`}]);
      inlineKeyboardArray.push([{text: "🧾 Заказы", callback_data: `orders?${ctx.session.pathOrder}`}]);
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
          callback_data: `orders/${order.id}`}]);
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
    await ctx.state.cart.saveOrder(ctx.session.orderId, {
      [ctx.session.fieldName]: ctx.message.text,
    });
    // exit scene
    ctx.reply("Данные сохранены. Обновите заказ!🔄", {
      reply_markup: {
        remove_keyboard: true,
      }});
    ctx.session.scene = null;
  },
  async (ctx) => {
    const inlineKeyboardArray = [];
    inlineKeyboardArray.push([{text: "Нова Пошта", callback_data: "createOrder/carrier_number?carrier_id=1"}]);
    inlineKeyboardArray.push([{text: "Самовывоз", callback_data: "createOrder/payment?carrier_id=2"}]);
    inlineKeyboardArray.push([{text: "⬅️ Назад",
      callback_data: `orders/${ctx.session.orderId}?${ctx.session.pathOrder}`}]);
    await ctx.editMessageCaption("<b>Способ доставки</b>",
        {
          parse_mode: "html",
          reply_markup: {
            inline_keyboard: [...inlineKeyboardArray],
          },
        });
  },
];
// edit order fields
ordersActions.push(async (ctx, next) => {
  // show order
  if (ctx.state.routeName === "editOrder") {
    const orderId = ctx.state.param;
    const editField = ctx.state.params.get("edit");
    if (editField) {
      const orderSnap = await firebase.firestore().collection("orders").doc(orderId).get();
      const order = {"id": orderSnap.id, ...orderSnap.data()};
      ctx.session.orderId = orderId;
      ctx.session.fieldName = editField;
      ctx.session.fieldValue = order[editField];
      orderWizard[0](ctx);
    }
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

exports.ordersActions = ordersActions;
exports.orderWizard = orderWizard;
