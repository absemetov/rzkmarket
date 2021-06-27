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
    <NuxtLink v-if="nextProductId" :to="{ name: 'p', query: { startAfter: nextProductId }}">
      Next
    </NuxtLink>
  </v-alert>
</template>
<script>
export default {
  data () {
    return {
      products: [],
      nextProductId: null,
      lastProduct: null
    }
  },
  async fetch () {
    let query = this.$fire.firestore.collection('products').limit(10)
    // get lastProduct if reload page
    if (this.$route.query.startAfter && !this.lastProduct) {
      // get lastProduct
      const lastProduct = await this.$fire.firestore.collection('products').doc(this.$route.query.startAfter).get()
      query = query.startAfter(lastProduct)
      // eslint-disable-next-line no-console
      console.log('server side', lastProduct)
    }
    // in client side
    if (this.$route.query.startAfter && this.lastProduct) {
      // eslint-disable-next-line no-console
      console.log('client side', this.lastProduct)
      query = query.startAfter(this.lastProduct)
    }
    // get all products
    const productsSnapshot = await query.get()
    // get next product ID
    if (productsSnapshot.size < 10) {
      this.nextProductId = null
    } else {
      this.nextProductId = productsSnapshot.docs[productsSnapshot.docs.length - 1].id
      // in client side save lastProduct
      if (process.client) {
        this.lastProduct = productsSnapshot.docs[productsSnapshot.docs.length - 1]
        // eslint-disable-next-line no-console
        console.log('client side lastProduct changed', this.lastProduct)
      }
    }
    // generate products array
    this.products = productsSnapshot.docs.map((doc) => {
      return { id: doc.id, ...doc.data() }
    })
    // load more
    // for (const doc of productsSnapshot.docs) {
    //   // if use back button check exist items
    //   const found = this.products.some(el => el.id === doc.id)
    //   if (!found) {
    //     this.products.push({
    //       id: doc.id,
    //       ...doc.data()
    //     })
    //   }
    // }
  },
  watch: {
    '$route.query': '$fetch'
  },
  mounted () {
    // every load page for lastProduct make query not profitable
    // this.lastProduct = await this.$fire.firestore.collection('products').doc(this.nextProductId).get()
    // eslint-disable-next-line no-console
    // console.log('mounted', this.lastProduct)
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
