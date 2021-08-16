<template>
  <div>
    <v-img
      lazy-src="https://picsum.photos/id/11/10/6"
      max-height="255"
      max-width="250"
      :src="product.mainPhoto.thumbnail"
      @click="overlay = !overlay"
    />
    <v-overlay :value="overlay">
      <v-btn class="hide-button" color="primary" @click="overlay = false">
        Hide Overlay
      </v-btn>
    </v-overlay>
    <h1>{{ product.name }}</h1>
    <div v-for="tag of product.tagsNames" :key="tag.id">
      {{ tag.id }} => {{ tag.name }}
    </div>
  </div>
</template>
<script>
export default {
  data: () => ({
    product: null,
    overlay: false,
    items: []
  }),
  async fetch () {
    const productData = await this.$fire.firestore.collection('products').doc(this.$route.params.id).get()
    let mainPhoto = null
    if (productData.data().mainPhoto) {
      mainPhoto = {
        thumbnail: `https://storage.googleapis.com/rzk-market-ua.appspot.com/photos/products/${productData.id}/1/${productData.data().mainPhoto[1]}.jpg`,
        origin: `https://storage.googleapis.com/rzk-market-ua.appspot.com/photos/products/${productData.id}/3/${productData.data().mainPhoto[3]}.jpg`
      }
    } else {
      // default img
      mainPhoto = {
        thumbnail: 'https://s3.eu-central-1.amazonaws.com/rzk.com.ua/250.56ad1e10bf4a01b1ff3af88752fd3412.jpg',
        origin: 'https://s3.eu-central-1.amazonaws.com/rzk.com.ua/250.56ad1e10bf4a01b1ff3af88752fd3412.jpg'
      }
    }
    const product = {
      id: productData.id,
      mainPhoto,
      name: productData.data().name,
      tagsNames: productData.data().tagsNames
    }
    // this.items.push({ src: mainPhoto.origin })
    this.product = product
  },
  methods: {
    onClickOutside () {
      this.overlay = false
    }
  }
}
</script>
<style scoped>
.hide-button {
  display: fixed;
  top: 16px;
  left: 16px;
}
</style>
