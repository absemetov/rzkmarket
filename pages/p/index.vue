<template>
  <v-alert>
    <p v-if="$fetchState.pending">
      <span class="loading" />
    </p>
    <ul>
      <li v-for="product of products" :key="product.id">
        <h1>
          <NuxtLink :to="{ name: 'p-id', params: { id: product.id } }">
            {{ product.id }} {{ product.name }}  {{ product.price }}
          </NuxtLink>
        </h1>
      </li>
    </ul>
    <NuxtLink :to="{ name: 'p', query: { startAfter: nextId }}">
      Load more
    </NuxtLink>
  </v-alert>
</template>
<script>
export default {
  data () {
    return {
      products: [],
      nextId: null,
      lastDoc: null
    }
  },
  async fetch () {
    let query = this.$fire.firestore.collection('products').limit(10)
    // get lastDoc if reload page
    if (this.$route.query.startAfter && !this.lastDoc) {
      // get lastDoc
      const lastDoc = await this.$fire.firestore.collection('products').doc(this.$route.query.startAfter).get()
      query = query.startAfter(lastDoc)
      // eslint-disable-next-line no-console
      console.log('server side', lastDoc)
    }
    // in client side
    if (this.$route.query.startAfter && this.lastDoc) {
      // eslint-disable-next-line no-console
      console.log('client side', this.lastDoc)
      query = query.startAfter(this.lastDoc)
    }

    const productsSnapshot = await query.get()
    // get next product ID
    this.nextId = productsSnapshot.docs[productsSnapshot.docs.length - 1].id
    // in client side save lastDoc
    if (process.client) {
      this.lastDoc = productsSnapshot.docs[productsSnapshot.docs.length - 1]
      // eslint-disable-next-line no-console
      console.log('client side lastDoc changed', this.lastDoc)
    }
    // generate products array
    // this.products = productsSnapshot.docs.map((doc) => {
    //   return { id: doc.id, ...doc.data() }
    // })
    // load more
    for (const doc of productsSnapshot.docs) {
      this.products.push({
        id: doc.id,
        ...doc.data()
      })
    }
  },
  watch: {
    '$route.query': '$fetch'
  },
  mounted () {
    // every load page for lastDoc make query not profitable
    // this.lastDoc = await this.$fire.firestore.collection('products').doc(this.nextId).get()
    // eslint-disable-next-line no-console
    // console.log('mounted', this.lastDoc)
  }
}
</script>
<style scoped>
.loading {
  display: inline-block;
  width: 1.5rem;
  height: 1.5rem;
  border: 4px solid rgba(9, 133, 81, 0.705);
  border-radius: 50%;
  border-top-color: #158876;
  animation: spin 1s ease-in-out infinite;
}
@keyframes spin {
  to {
    -webkit-transform: rotate(360deg);
  }
}
</style>
