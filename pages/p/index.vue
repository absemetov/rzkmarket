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
    <NuxtLink v-if="nextProductId" :to="{ name: 'p', query: { endBefore: nextProductId }}">
      Prev 10
    </NuxtLink>
    <NuxtLink v-if="nextProductId" :to="{ name: 'p', query: { startAfter: nextProductId }}">
      Next 10
    </NuxtLink>
  </v-alert>
</template>
<script>
export default {
  data () {
    return {
      products: [],
      nextProductId: null,
      snapshots: []
    }
  },
  async fetch () {
    let query = this.$fire.firestore.collection('products').limit(10)
    // make query Next link
    if (this.$route.query.startAfter) {
      let lastProduct = null
      // // in client side
      if (this.snapshots[this.$route.query.startAfter]) {
        lastProduct = this.snapshots[this.$route.query.startAfter]
      } else {
        lastProduct = await this.$fire.firestore.collection('products').doc(this.$route.query.startAfter).get()
      }
      // if back button click
      //   if (this.$route.query.startAfter === this.lastProduct.id) {
      //     lastProduct = this.lastProduct
      //   } else {
      //     lastProduct = await this.$fire.firestore.collection('products').doc(this.$route.query.startAfter).get()
      //   }
      // } else {
      // get lastProduct on server
      // }
      query = query.startAfter(lastProduct)
    }
    // get query prodycts
    const productsSnapshot = await query.get()

    // get next product ID
    if (productsSnapshot.size < 10) {
      this.nextProductId = null
    } else {
      this.nextProductId = productsSnapshot.docs[productsSnapshot.docs.length - 1].id
      // in client side save lastProduct
      if (process.client) {
        this.snapshots[this.nextProductId] = productsSnapshot.docs[productsSnapshot.docs.length - 1]
      }
    }
    // generate products array
    // this.products = productsSnapshot.docs.map((doc) => {
    //   return { id: doc.id, ...doc.data() }
    // })
    // load more
    if (this.$route.query.fullPath === '/p') {
      // eslint-disable-next-line no-console
      console.log('snap detect', typeof this.$route.fullPath)
      this.products = []
      this.snapshots = []
    }
    for (const doc of productsSnapshot.docs) {
      // if use back button check exist items
      const found = this.products.some(el => el.id === doc.id)
      if (!found) {
        this.products.push({
          id: doc.id,
          ...doc.data()
        })
      }
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
