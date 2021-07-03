<template>
  <v-alert>
    <v-breadcrumbs :items="items" large />
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
  async asyncData ({ params, $fire }) {
    const catalogSnapshot = await $fire.firestore.collection('catalogs').doc(params.id).get()
    const catalog = { id: catalogSnapshot.id, ...catalogSnapshot.data() }
    const items = []
    items.push({ text: 'Main', exact: true, to: { name: 'c' } })
    if (catalog.parentId) {
      items.push({ text: '..', to: { name: 'c-id', params: { id: catalog.parentId } } })
    }
    items.push({ text: catalog.name, to: { name: 'c-id', params: { id: catalog.id } } })
    const catalogsSnapshot = await $fire.firestore.collection('catalogs').where('parentId', '==', catalog.id).get()
    // generate catalogs array
    const catalogs = catalogsSnapshot.docs.map((doc) => {
      return { id: doc.id, ...doc.data() }
    })
    return { items, catalogs }
  }
}
</script>
