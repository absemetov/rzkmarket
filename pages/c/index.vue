<template>
  <v-alert>
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
    const catalogsSnapshot = await $fire.firestore.collection('catalogs').where('parentId', '==', null).orderBy('timestamp').get()
    // generate catalogs array
    const catalogs = catalogsSnapshot.docs.map((doc) => {
      return { id: doc.id, ...doc.data() }
    })
    return { catalogs }
  }
}
</script>
