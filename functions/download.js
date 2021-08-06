const fs = require("fs");
const https = require("https");
const {basename} = require("path");
const TIMEOUT = 10000;
// Creates /tmp/a/apple, regardless of whether `/tmp` and /tmp/a exist.
// fs.mkdir("/tmp/rzk", {recursive: true}, (err) => {
//   if (err) throw err;
// });
module.exports = function(url) {
  const myURL = new URL(url);
  const fileName = basename(myURL.pathname);
  const file = fs.createWriteStream(`/tmp/${fileName}`);
  // http.get(url, function(response) {
  //   response.pipe(file);
  // });
  return new Promise(function(resolve, reject) {
    const request = https.get(url).on("response", function(res) {
      // const len = parseInt(res.headers["content-length"], 10);
      // let downloaded = 0;
      // let percent = 0;
      res
          .on("data", function(chunk) {
            file.write(chunk);
            // downloaded += chunk.length;
            // percent = (100.0 * downloaded / len).toFixed(2);
            // process.stdout.write(`Downloading ${percent}% ${downloaded} bytes\r`);
            // console.log(`Downloading ${percent}% ${downloaded} bytes\r`);
          })
          .on("end", function() {
            file.end();
            // console.log(`${url} downloaded to: ${file.path}`);
            resolve(file.path);
          })
          .on("error", function(err) {
            reject(err);
          });
    });
    request.setTimeout(TIMEOUT, function() {
      request.destroy();
      reject(new Error(`request timeout after ${TIMEOUT / 1000.0}s`));
    });
  });
};
