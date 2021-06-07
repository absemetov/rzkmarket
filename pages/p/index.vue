<template>
  <v-alert type="success">
    <ul>
      <li v-for="product of products" :key="product.id">
        <h1>{{ product.id }} {{ product.name }}  {{ product.price }}</h1>
      </li>
    </ul>
  </v-alert>
</template>
<script>
export default {
  async asyncData ({ params, $http, $fire }) {
    const productsSnapshot = await $fire.firestore.collection('products').limit(10).get()

    const products = productsSnapshot.docs.map((doc) => {
      return { id: doc.id, ...doc.data() }
    })

    return { products }
  }
}
</script>
