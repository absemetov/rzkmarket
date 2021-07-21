<template>
  <v-alert>
    <h1>
      Product {{ product }} {{ product.name }} {{ product.price }}
    </h1>
    <div v-for="key of Object.keys(product.tags)" :key="key">
      {{ key }} => {{ Object.keys(product.tags[key])[0] }}
    </div>
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
