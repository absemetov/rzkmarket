const firebase = require("firebase-admin");
const storeHandler = async (ctx, next) => {
  const store = {
    async queryRecord(modelName, queryObject) {
      if (queryObject.objectId) {
        const modelSnap = await firebase.firestore().collection("objects").doc(queryObject.objectId)
            .collection(modelName).doc(queryObject.id).get();
        // check data
        if (modelSnap.exists) {
          return {"id": modelSnap.id, ...modelSnap.data()};
        }
      }
      return null;
    },
    async getRecord(modelName, queryObject) {
      return await firebase.firestore().collection("objects").doc(queryObject.objectId)
          .collection(modelName).doc(queryObject.id).get();
    },
  };
  ctx.state.store = store;
  return next();
};

exports.storeHandler = storeHandler;
