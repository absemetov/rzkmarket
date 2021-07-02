<template>
  <v-alert>
    <ul>
      <li v-for="product of products" :key="product.id">
        <h1>
          <NuxtLink :to="{ name: 'p-id', params: { id: product.id } }">
            {{ product.i }} {{ product.id }} {{ product.name }}  {{ product.price }}
          </NuxtLink>
        </h1>
      </li>
    </ul>
    <p v-if="$fetchState.pending">
      <span class="loading" />
    </p>
    <NuxtLink v-if="nextProductId&&!$fetchState.pending" :prefetch="false" :to="{ name: 'p', query: { startAfter: nextProductId }}">
      Load more ...
    </NuxtLink>
  </v-alert>
</template>
<script>
export default {
  data () {
    return {
      products: [],
      nextProductId: null,
      lastProduct: null,
      lastPage: false
    }
  },
  async fetch () {
    let query = this.$fire.firestore.collection('products').orderBy('timestamp').limit(10)
    // make query Next link
    if (this.$route.query.startAfter) {
      let lastProduct = null
      // // in client side or last page next false!
      if (this.lastProduct || this.lastPage) {
        // back button click
        if (this.$route.query.startAfter !== this.nextProductId) {
          // eslint-disable-next-line no-console
          console.log('back button detect', this.$route.query.startAfter, this.nextProductId)
          this.products = []
          lastProduct = await this.$fire.firestore.collection('products').doc(this.$route.query.startAfter).get()
          // return false
        } else {
          // eslint-disable-next-line no-console
          console.log('snap detect +++', this.$route.query.startAfter, this.nextProductId)
          lastProduct = this.lastProduct
        }
      } else {
        // server side get last snapshot
        // eslint-disable-next-line no-console
        console.log('server res', this.$route.query.startAfter, this.nextProductId)
        lastProduct = await this.$fire.firestore.collection('products').doc(this.$route.query.startAfter).get()
      }
      query = query.startAfter(lastProduct)
    }
    // get query prodycts
    const productsSnapshot = await query.get()

    // get next product ID
    if (productsSnapshot.size < 10) {
      this.lastPage = true
      this.nextProductId = null
    } else {
      this.nextProductId = productsSnapshot.docs[productsSnapshot.docs.length - 1].id
      // in client side save lastProduct, in server side problem hidrate data
      if (process.client) {
        this.lastProduct = productsSnapshot.docs[productsSnapshot.docs.length - 1]
      }
    }
    // clear data on index page
    if (process.client && !this.$route.query.startAfter) {
      this.products = []
      this.lastPage = false
    }
    // generate products array
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
