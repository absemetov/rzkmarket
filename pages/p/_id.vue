<template>
  <div>
    <v-breadcrumbs :items="breadcrumbs" large />
    <v-img
      max-width="180"
      :src="mainPhoto.thumbnail"
      @click="overlay = !overlay"
    />
    <v-dialog
      v-model="overlay"
      width="800"
    >
      <v-col class="text-right">
        <v-btn
          icon
          dark
          @click="overlay = false"
        >
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-col>
      <v-carousel height="auto" :show-arrows="showArrows" :hide-delimiters="hideDelimiters">
        <v-carousel-item
          v-for="(item,i) in items"
          :key="i"
        >
          <a :href="item.origin" target="_blank">origin photo</a>
          <v-img class="mx-auto" :lazy-src="item.thumbnail" :src="item.big" max-width="450" />
        </v-carousel-item>
      </v-carousel>
    </v-dialog>
    <h1>{{ product.name }}</h1>
    <div v-for="tag of product.tagsNames" :key="tag.id">
      {{ tag.id }} => {{ tag.name }}
    </div>
  </div>
</template>
<script>
export default {
  data: () => ({
    product: {},
    mainPhoto: {},
    overlay: false,
    items: [],
    breadcrumbs: [],
    showArrows: false,
    hideDelimiters: true
  }),
  async fetch () {
    const productData = await this.$fire.firestore.collection('products').doc(this.$route.params.id).get()
    if (productData.data().mainPhoto) {
      this.mainPhoto = {
        thumbnail: `https://storage.googleapis.com/rzk-market-ua.appspot.com/photos/products/${productData.id}/1/${productData.data().mainPhoto}.jpg`,
        big: `https://storage.googleapis.com/rzk-market-ua.appspot.com/photos/products/${productData.id}/2/${productData.data().mainPhoto}.jpg`,
        origin: `https://storage.googleapis.com/rzk-market-ua.appspot.com/photos/products/${productData.id}/3/${productData.data().mainPhoto}.jpg`
      }
    } else {
      // default img
      this.mainPhoto = {
        thumbnail: 'https://s3.eu-central-1.amazonaws.com/rzk.com.ua/250.56ad1e10bf4a01b1ff3af88752fd3412.jpg',
        big: 'https://s3.eu-central-1.amazonaws.com/rzk.com.ua/250.56ad1e10bf4a01b1ff3af88752fd3412.jpg'
      }
    }
    this.product = {
      id: productData.id,
      ...productData.data()
    }
    // first add main photo
    this.items.push(this.mainPhoto)
    // add other photos
    for (const photoId of this.product.photos) {
      if (this.product.mainPhoto !== photoId) {
        this.items.push({
          thumbnail: `https://storage.googleapis.com/rzk-market-ua.appspot.com/photos/products/${productData.id}/1/${photoId}.jpg`,
          big: `https://storage.googleapis.com/rzk-market-ua.appspot.com/photos/products/${productData.id}/2/${photoId}.jpg`,
          origin: `https://storage.googleapis.com/rzk-market-ua.appspot.com/photos/products/${productData.id}/3/${photoId}.jpg`
        })
      }
    }
    if (this.items.length > 1) {
      this.hideDelimiters = false
      this.showArrows = true
    }
    // add breadcrumbs
    this.breadcrumbs.push({ text: 'Back', to: { name: 'c-id', params: { id: this.product.catalog.parentId } } })
    this.breadcrumbs.push({ text: this.product.catalog.name, to: { name: 'c-id', params: { id: this.product.catalog.id } } })
  }
}
</script>
<style scoped>

</style>
