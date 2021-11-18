const firebase = require("firebase-admin");
const storeHandler = async (ctx, next) => {
  const store = {
    async queryRecord(modelName, queryObject) {
      if (queryObject.objectId) {
        const modelSnap = await firebase.firestore().collection("objects").doc(queryObject.objectId)
            .collection(modelName).doc(queryObject.id).get();
        // snap
        if (queryObject.snap) {
          return modelSnap;
        }
        // check data
        if (modelSnap.exists) {
          const data = modelSnap.data();
          const sortedArray = [];
          if (queryObject.sort) {
            for (const [id, product] of Object.entries(modelSnap.data()[queryObject.sort])) {
              sortedArray.push({id, ...product});
            }
            // sort products by createdAt
            sortedArray.sort(function(a, b) {
              return a.createdAt - b.createdAt;
            });
            data[queryObject.sort] = sortedArray;
          }
          return {"id": modelSnap.id, ...data};
        }
      }
      return null;
    },
  };
  ctx.state.store = store;
  return next();
};

exports.storeHandler = storeHandler;
