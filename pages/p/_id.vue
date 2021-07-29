<template>
  <v-alert>
    <h1>
      Product {{ product }}
    </h1>
    <div v-for="tag of product.tagsNames" :key="tag.id">
      {{ tag.id }} => {{ tag.name }}
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
