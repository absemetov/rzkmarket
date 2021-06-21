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
    <button @click="paginate">
      Refresh
    </button>
    <NuxtLink :to="{ name: 'p', query: { startAfter: lastDoc.id }}">
      Next {{ query.startAfter }}
    </NuxtLink>
  </v-alert>
</template>
<script>
export default {
  async asyncData ({ params, query, $http, $fire }) {
    const productsSnapshot = await $fire.firestore.collection('products').limit(10).get()
    const lastDoc = productsSnapshot.docs[productsSnapshot.docs.length - 1]
    // Keep track of the last loaded document.
    const products = productsSnapshot.docs.map((doc) => {
      return { id: doc.id, ...doc.data() }
    })
    console.info(query)
    // const productsSnapshot = await $fire.firestore.collection('products').orderBy('name').startAfter('21111025').limit(10).get()
    // const productsSnapshot1 = await $fire.firestore.collection('products').limit(10).startAfter(lastDoc).get()
    // const productsSnapshot = await $fire.firestore.collection('products').orderBy('name').startAfter('21111025').limit(10).get()
    // Keep track of the last loaded document.
    // const products = productsSnapshot1.docs.map((doc) => {
    //   return { id: doc.id, ...doc.data() }
    // })
    return { products, lastDoc, query }
  },
  methods: {
    paginate () {
      alert('tetet')
    }
  }
}
</script>
