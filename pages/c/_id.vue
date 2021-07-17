<template>
  <v-alert>
    <v-breadcrumbs :items="breadcrumbs" large />
    <ul>
      <li v-for="catalog of catalogs" :key="catalog.id">
        <h1>
          <NuxtLink :to="{ name: 'c-id', params: { id: catalog.id } }">
            {{ catalog.name }} {{ catalog.timestamp }}
          </NuxtLink>
        </h1>
      </li>
    </ul>
    <p v-if="$fetchState.pending">
      <span class="loading" />
    </p>
  </v-alert>
</template>
<script>
export default {
  data () {
    return {
      breadcrumbs: [],
      catalogs: []
    }
  },
  async fetch () {
    const catalogSnapshot = await this.$fire.firestore.collection('catalogs').doc(this.$route.params.id).get()
    const currentCatalog = { id: catalogSnapshot.id, ...catalogSnapshot.data() }
    if (currentCatalog.parentId) {
      this.breadcrumbs.push({ text: 'Back', to: { name: 'c-id', params: { id: currentCatalog.parentId } } })
    } else {
      this.breadcrumbs.push({ text: 'Back', exact: true, to: { name: 'c' } })
    }
    this.breadcrumbs.push({ text: currentCatalog.name, to: { name: 'c-id', params: { id: catalogSnapshot.id } } })
    const catalogsSnapshot = await this.$fire.firestore.collection('catalogs').where('parentId', '==', currentCatalog.id).orderBy('orderNumber').get()
    // generate catalogs array
    for (const item of catalogsSnapshot.docs) {
      this.catalogs.push({ id: item.id, ...item.data() })
    }
  }
}
</script>
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
