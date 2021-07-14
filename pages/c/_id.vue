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
  </v-alert>
</template>
<script>
export default {
  async asyncData ({ params, $fire }) {
    const catalogSnapshot = await $fire.firestore.collection('catalogs').doc(params.id).get()
    const catalog = { id: catalogSnapshot.id, ...catalogSnapshot.data() }
    const breadcrumbs = []
    if (catalog.parentId) {
      breadcrumbs.push({ text: 'Back', to: { name: 'c-id', params: { id: catalog.parentId } } })
    } else {
      breadcrumbs.push({ text: 'Back', exact: true, to: { name: 'c' } })
    }
    breadcrumbs.push({ text: catalog.name, to: { name: 'c-id', params: { id: catalog.id } } })
    const catalogsSnapshot = await $fire.firestore.collection('catalogs').where('parentId', '==', catalog.id).orderBy('orderNumber').get()
    // generate catalogs array
    const catalogs = []
    for (const catalog of catalogsSnapshot.docs) {
      const catalogData = catalog.data()
      // show current catalogs
      if (catalogData.updatedAt === 1626290744) {
        catalogs.push({ id: catalog.id, ...catalog.data() })
      } else {
        // Delete old catalogs (security problem????)
        catalog.ref.delete()
      }
    }
    return { breadcrumbs, catalogs }
  }
}
</script>
