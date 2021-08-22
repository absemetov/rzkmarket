<template>
  <v-alert>
    <v-breadcrumbs :items="breadcrumbs" large />
    <ul>
      <li v-for="tag of currentCatalog.tags" :key="tag.id">
        <NuxtLink :to="{ name: 'c-id', query: { tag: tag.id }}">
          {{ tag.name }}
        </NuxtLink>
      </li>
    </ul>
    <div v-if="$route.query.tag">
      Your choise: <b>{{ $route.query.tag }}</b>
      <NuxtLink :to="{ name: 'c-id' }">
        Delete
      </NuxtLink>
    </div>
    <ul>
      <li v-for="catalog of catalogs" :key="catalog.id">
        <h1>
          <NuxtLink :to="{ name: 'c-id', params: { id: catalog.id } }">
            {{ catalog.name }} {{ catalog.timestamp }}
          </NuxtLink>
        </h1>
      </li>
    </ul>
    <ul>
      <li v-for="product of products" :key="product.id">
        <NuxtLink :to="{ name: 'p-id', params: { id: product.id } }">
          <v-img
            max-height="255"
            max-width="250"
            :src="product.mainPhoto.thumbnail"
          />
        </NuxtLink>
        <h1>
          <NuxtLink :to="{ name: 'p-id', params: { id: product.id } }">
            {{ product.name }} {{ product.updatedAt }}
          </NuxtLink>
        </h1>
      </li>
    </ul>
    <div v-if="$fetchState.pending" class="text-center">
      <v-progress-circular
        indeterminate
        color="primary"
      />
    </div>
    <NuxtLink v-if="nextProductId&&!$fetchState.pending" :to="{ name: 'c-id', query: { startAfter: nextProductId, tag: $route.query.tag }}">
      Load more ...
    </NuxtLink>
  </v-alert>
</template>
<script>
export default {
  data: () => ({
    limit: 10,
    catalogs: [],
    currentCatalog: {},
    breadcrumbs: [],
    products: [],
    nextProductId: null,
    lastProduct: null,
    lastPage: false
  }),
  async fetch () {
    // clear data on index page
    if (process.client && !this.$route.query.startAfter) {
      this.products = []
      this.lastPage = false
    }
    const currentCatalogSnapshot = await this.$fire.firestore.collection('catalogs').doc(this.$route.params.id).get()
    this.currentCatalog = { id: currentCatalogSnapshot.id, ...currentCatalogSnapshot.data() }
    // clear breadcrumbs before
    this.breadcrumbs = []
    if (this.currentCatalog.parentId) {
      this.breadcrumbs.push({ text: 'Back', to: { name: 'c-id', params: { id: this.currentCatalog.parentId } } })
    } else {
      this.breadcrumbs.push({ text: 'Back', exact: true, to: { name: 'c' } })
    }
    this.breadcrumbs.push({ text: this.currentCatalog.name, to: { name: 'c-id', params: { id: currentCatalogSnapshot.id } } })
    const catalogsSnapshot = await this.$fire.firestore.collection('catalogs').where('parentId', '==', this.currentCatalog.id).orderBy('orderNumber').get()
    // generate catalogs array
    for (const catalog of catalogsSnapshot.docs) {
      this.catalogs.push({ id: catalog.id, ...catalog.data() })
    }
    // generate products array
    let query = this.$fire.firestore.collection('products').where('catalog.id', '==', currentCatalogSnapshot.id).orderBy('orderNumber').limit(this.limit)
    // filter by tag
    if (this.$route.query.tag) {
      query = query.where('tags', 'array-contains', this.$route.query.tag)
    }
    // make query Next link
    if (this.$route.query.startAfter) {
      let lastProduct = null
      // // in client side or last page next false!
      if (this.lastProduct || this.lastPage) {
        // back button click
        if (this.$route.query.startAfter !== this.nextProductId) {
          this.products = []
          lastProduct = await this.$fire.firestore.collection('products').doc(this.$route.query.startAfter).get()
        } else {
          lastProduct = this.lastProduct
        }
      } else {
        // server side get last snapshot
        lastProduct = await this.$fire.firestore.collection('products').doc(this.$route.query.startAfter).get()
      }
      query = query.startAfter(lastProduct)
    }
    // get query prodycts
    const productsSnapshot = await query.get()

    // get next product ID
    if (productsSnapshot.size < this.limit) {
      this.lastPage = true
      this.nextProductId = null
    } else {
      this.nextProductId = productsSnapshot.docs[productsSnapshot.docs.length - 1].id
      // in client side save lastProduct, in server side problem hidrate data
      if (process.client) {
        this.lastProduct = productsSnapshot.docs[productsSnapshot.docs.length - 1]
      }
    }
    // generate products array
    for (const product of productsSnapshot.docs) {
      let mainPhoto = null
      if (product.data().mainPhoto) {
        mainPhoto = {
          thumbnail: `https://storage.googleapis.com/rzk-market-ua.appspot.com/photos/products/${product.id}/1/${product.data().mainPhoto}.jpg`,
          origin: `https://storage.googleapis.com/rzk-market-ua.appspot.com/photos/products/${product.id}/3/${product.data().mainPhoto}.jpg`
        }
      } else {
        // default img
        mainPhoto = {
          thumbnail: 'https://s3.eu-central-1.amazonaws.com/rzk.com.ua/250.56ad1e10bf4a01b1ff3af88752fd3412.jpg',
          origin: 'https://s3.eu-central-1.amazonaws.com/rzk.com.ua/250.56ad1e10bf4a01b1ff3af88752fd3412.jpg'
        }
      }
      this.products.push({
        id: product.id,
        mainPhoto,
        name: product.data().name,
        updatedAt: product.data().updatedAt
      })
    }
  },
  watch: {
    '$route.query': '$fetch'
  }
}
</script>
</script>
