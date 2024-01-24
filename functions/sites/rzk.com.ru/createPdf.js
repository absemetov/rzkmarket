const PDFDocument = require("pdfkit");
const {store, roundNumber} = require("../.././bot/bot_store_cart.js");
const companyLogo = `${__dirname}/logo/logo-ru.png`;
const fontRegular = `${__dirname}/fonts/GolosText-Regular.ttf`;
const fontBold = `${__dirname}/fonts/GolosText-SemiBold.ttf`;
const columnPosition = 20;
let rowPosition = 0;

function createPdf(res, data) {
  rowPosition = 20;
  const doc = new PDFDocument({size: "A4", margin: 20, info: {Author: "Nadir Absemetov: absemetov.org.ua"}});
  if (data.client === "web") {
    // res.setHeader("Content-disposition", `inline; filename=${data.filename}.pdf`);
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=${data.filename}.pdf`,
    });
    doc.pipe(res);
  } else {
    // bot
    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", async () => {
      const pdfData = Buffer.concat(buffers);
      if (data.type === "order") {
        await res.replyWithDocument({source: pdfData, filename: `${data.filename}.pdf`}, {caption: `${data.order.lastName} ${data.order.firstName} ${data.order.phoneNumber}`});
      } else {
        await res.replyWithDocument({source: pdfData, filename: `${data.filename}.pdf`});
      }
    });
  }
  // const buffers = [];
  // doc.on("data", buffers.push.bind(buffers));
  // doc.on("end", () => {
  //   const pdfData = Buffer.concat(buffers);
  //   res.writeHead(200, {
  //     "Content-Length": Buffer.byteLength(pdfData),
  //     "Content-Type": "application/pdf",
  //     "Content-disposition": `attachment;filename=${data.filename}.pdf`}).end(pdfData);
  // });
  generateHeader(doc, data);
  generateCustomerInformation(doc, data);
  generateProductsTable(doc, data);
  // generateFooter(doc, data);
  doc.end();
}

function generateHeader(doc, data) {
  // logo
  doc.image(companyLogo, columnPosition, rowPosition, {width: 30});
  doc.font(fontBold).fontSize(18).text(data.siteName, columnPosition + 35, rowPosition + 5);
  // obj info
  for (const phoneNumber of data.i18n.phones) {
    doc.font(fontRegular).fontSize(10).fillColor("blue").text(phoneNumber(), columnPosition + 250, rowPosition, {align: "right", link: `tel:${phoneNumber()}`});
    rowPosition += 15;
  }
  doc.font(fontRegular).fontSize(10).fillColor("blue").text(data.domain, columnPosition + 250, rowPosition, {align: "right", link: data.domain});
  rowPosition += 15;
}

function generateCustomerInformation(doc, data) {
  // doc type cart or order
  if (data.type === "cart") {
    doc.font(fontRegular).fontSize(14).fillColor("#000").text(`${data.i18n.cart}`, columnPosition, rowPosition, {align: "center"});
    doc.font(fontRegular).fontSize(10).text(new Date().toLocaleString("ru-RU", {timeZone: "Europe/Moscow"}), columnPosition, rowPosition + 20, {align: "center"});
    rowPosition += 50;
  } else {
    doc.font(fontRegular).fontSize(14).fillColor("#000").text(`${data.i18n.order} № ${data.order.userId}-${data.order.orderNumber}`, columnPosition, rowPosition, {align: "left"});
    doc.font(fontRegular).fontSize(10).text(new Date(data.order.createdAt * 1000).toLocaleString("ru-RU", {timeZone: "Europe/Moscow"}), columnPosition, rowPosition + 5, {align: "right"});
    doc.font(fontBold).fontSize(10).text(`${data.i18n.buyer}: `, columnPosition, rowPosition + 30)
        .font(fontRegular).text(`${data.order.lastName} ${data.order.firstName} ${data.order.phoneNumber}`, columnPosition + 90, rowPosition + 30);
    doc.font(fontBold).fontSize(10).text(`${data.i18n.delivery}: `, columnPosition, rowPosition + 45)
        .font(fontRegular).text(`${data.order.address}, ${store.carriers().get(data.order.carrierId).name} ${data.order.carrierNumber ? "#" + data.order.carrierNumber : ""}`, columnPosition + 90, rowPosition + 45);
    doc.font(fontBold).fontSize(10).text("Оплата: ", columnPosition, rowPosition + 60)
        .font(fontRegular).text(`${store.payments().get(data.order.paymentId)}\n`, columnPosition + 90, rowPosition + 60);
    if (data.order.comment) {
      doc.font(fontBold).fontSize(10).text(`${data.i18n.comment}: `, columnPosition, rowPosition + 75)
          .font(fontRegular).text(data.order.comment, columnPosition + 90, rowPosition + 75, {width: 450});
      const textHeight = doc.heightOfString(data.order.comment, {width: 450});
      rowPosition += textHeight + 90;
    } else {
      rowPosition += 85;
    }
  }
}

function generateProductsTable(doc, data) {
  doc.font(fontBold).fontSize(10)
      .text("#", columnPosition + 5, rowPosition)
      .text(data.i18n.prodCode, columnPosition + 25, rowPosition)
      .text(data.i18n.prodName, columnPosition + 110, rowPosition)
      .text(data.i18n.tQty, columnPosition + 365, rowPosition)
      .text(data.i18n.prodPrice, columnPosition + 430, rowPosition)
      .text(data.i18n.tSum, columnPosition + 495, rowPosition);
  generateHr(doc, rowPosition + 20);
  rowPosition += 25;
  let totalSum = 0;
  for (const [index, product] of data.products.entries()) {
    doc.font(fontRegular).fontSize(10).text(index + 1, columnPosition + 5, rowPosition);
    doc.text(product.productId, columnPosition + 25, rowPosition, {width: 80});
    doc.fillColor("blue").text(product.name, columnPosition + 110, rowPosition, {width: 250, link: `${data.domain}/o/${product.objectId}/p/${product.productId}`});
    doc.fillColor("#000").text(`${product.qty} ${product.unit}`, columnPosition + 365, rowPosition, {width: 60});
    doc.text(`${product.price.toLocaleString("ru-RU")} ${data.currency}`, columnPosition + 430, rowPosition, {width: 65});
    doc.text(`${roundNumber(product.qty * product.price).toLocaleString("ru-RU")} ${data.currency}`, columnPosition + 495, rowPosition, {width: 60});
    const textHeight = Math.max(doc.heightOfString(product.productId, {width: 80}), doc.heightOfString(product.name, {width: 250})) + 5;
    generateHr(doc, rowPosition + textHeight);
    rowPosition += textHeight + 5;
    totalSum += product.qty * product.price;
  }

  doc.font(fontBold).fontSize(12).text(data.i18n.tSum, columnPosition + 5, rowPosition + 10);
  doc.font(fontBold).fontSize(12).text(`${roundNumber(totalSum).toLocaleString("ru-RU")} ${data.currency}`, columnPosition + 60, rowPosition + 10);
  rowPosition += 35;
}

// function generateFooter(doc, data) {
//   if (data.type === "cart") {
//     doc.font(fontRegular).fontSize(10).text(data.i18n.cartLink, columnPosition, rowPosition, {width: 500});
//     const products = data.products.map((prod) => `products=${prod.id}+${prod.qty}`).join("&");
//     doc.fillColor("blue")
//         .text(`${data.domain}/cart?${products}`,
//             columnPosition, rowPosition + 15, {width: 550, link: `${data.domain}/cart?${products}`});
//   } else {
//     doc.fillColor("blue").fontSize(10)
//         .text(`${data.domain}/o/${data.objectId}/s/${data.order.id}`,
//             columnPosition, rowPosition + 15, {width: 550, link: `${data.domain}/o/${data.objectId}/s/${data.order.id}`});
//   }
// encode uri
// doc.fillColor("blue")
//     .text(`${envSite.domain}/o/${data.object.id}/cart?products=${encodeURIComponent(JSON.stringify(data.products.map((prod) => ({id: prod.id, qty: prod.qty}))))}`,
//         columnPosition, rowPosition + 15, {width: 550, link: `${envSite.domain}/o/${data.object.id}/cart?products=${encodeURIComponent(JSON.stringify(data.products.map((prod) => ({id: prod.id, qty: prod.qty}))))}`});
// use getAll search params
// }

function generateHr(doc, y) {
  doc.strokeColor("#aaaaaa").lineWidth(1).moveTo(columnPosition, y).lineTo(570, y).stroke();
}

module.exports = {
  createPdf,
};
