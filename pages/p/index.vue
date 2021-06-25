<template>
  <v-alert>
    <ul>
      <li v-for="product of products" :key="product.id">
        <h1>
          <NuxtLink :to="{ name: 'p-id', params: { id: product.id } }">
            {{ product.id }} {{ product.name }}  {{ product.price }}
          </NuxtLink>
        </h1>
      </li>
    </ul>
    <NuxtLink :to="{ name: 'p', query: { startAfter: next }}">
      Next {{ next }}
    </NuxtLink>
  </v-alert>
</template>
<script>
export default {
  data () {
    return {
      products: [],
      next: null
    }
  },
  async fetch () {
    let query = this.$fire.firestore.collection('products').limit(10)
    // get lastDoc if reload page
    if (this.$route.query.startAfter) {
      const lastDoc = await this.$fire.firestore.collection('products').doc(this.$route.query.startAfter).get()
      query = query.startAfter(lastDoc)
    }
    const productsSnapshot = await query.get()
    this.next = productsSnapshot.docs[productsSnapshot.docs.length - 1].id
    this.products = productsSnapshot.docs.map((doc) => {
      return { id: doc.id, ...doc.data() }
    })
  },
  watch: {
    '$route.query': '$fetch'
  },
  mounted () {
    // eslint-disable-next-line no-console
    console.log(this.next)
  }
}
</script>
