const fs = require("fs");
const mkdirp = fs.promises.mkdir;
const path = require("path");
const os = require("os");
const https = require("https");
// const {basename} = require("path");
const axios = require("axios");
const TIMEOUT = 10000;
// Creates /tmp/a/apple, regardless of whether `/tmp` and /tmp/a exist.
// fs.mkdir("/tmp/rzk", {recursive: true}, (err) => {
//   if (err) throw err;
// });
exports.download = async function(url) {
  // axios image download with response type "stream"
  const response = await axios({
    method: "GET",
    url,
    responseType: "stream",
  });
  const myURL = new URL(url);
  // get file name exm file_95.jpg
  const fileName = path.basename(myURL.pathname);
  const tempLocalFile = path.join(os.tmpdir(), "/rzk", fileName);
  const tempLocalDir = path.dirname(tempLocalFile);
  // Create the temp directory where the storage file will be downloaded.
  await mkdirp(tempLocalDir, {recursive: true});
  const file = fs.createWriteStream(tempLocalFile);

  // pipe the result stream into a file on disc
  response.data.pipe(file);

  // return a promise and resolve when download finishes
  return new Promise((resolve, reject) => {
    response.data.on("end", () => {
      resolve(tempLocalFile);
    });

    response.data.on("error", (err) => {
      reject(err);
    });
  });
};

exports.downloadHttps = async function(url) {
  const myURL = new URL(url);
  // get file name exm file_95.jpg
  const fileName = path.basename(myURL.pathname);
  const tempLocalFile = path.join(os.tmpdir(), "/rzk", fileName);
  const tempLocalDir = path.dirname(tempLocalFile);
  // Create the temp directory where the storage file will be downloaded.
  await mkdirp(tempLocalDir, {recursive: true});
  const file = fs.createWriteStream(tempLocalFile);
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
            resolve(tempLocalFile);
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
