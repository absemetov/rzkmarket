<template>
  <v-alert>
    <h1>
      Product {{ product }} {{ product.name }} {{ product.price }}
    </h1>
  </v-alert>
</template>
<script>
export default {
  async asyncData ({ params, $fire }) {
    const doc = await $fire.firestore.collection('products').doc(params.id).get()
    const product = { id: doc.id, ...doc.data() }
    return { product }
  }
}
</script>
