<template>
  <v-alert>
    <p v-if="$fetchState.pending">
      <span class="loading" />
    </p>
    <ul>
      <li v-for="catalog of catalogs" :key="catalog.id">
        <h1>
          <NuxtLink :to="{ name: 'c-id', params: { id: catalog.id } }">
            {{ catalog.name }}
          </NuxtLink>
        </h1>
      </li>
    </ul>
  </v-alert>
</template>
<script>
export default {
  data () {
    return {
      catalogs: []
    }
  },
  async fetch () {
    const catalogsSnapshot = await this.$fire.firestore.collection('catalogs').where('parentId', '==', null).orderBy('orderNumber').get()
    // generate catalogs array
    this.catalogs = catalogsSnapshot.docs.map((doc) => {
      return { id: doc.id, ...doc.data() }
    })
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
