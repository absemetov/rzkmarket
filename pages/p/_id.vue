<template>
  <v-alert>
    <v-overlay :value="overlay">
      <v-img
        lazy-src="https://picsum.photos/id/11/10/6"
        :src="product.mainPhoto.origin"
      />
      <v-btn
        color="success"
        @click="overlay = false"
      />
    </v-overlay>
    <v-img
      lazy-src="https://picsum.photos/id/11/10/6"
      max-height="255"
      max-width="250"
      :src="product.mainPhoto.thumbnail"
      @click="overlay = !overlay"
    />
    <h1>{{ product.name }}</h1>
    <div v-for="tag of product.tagsNames" :key="tag.id">
      {{ tag.id }} => {{ tag.name }}
    </div>
  </v-alert>
</template>
<script>
export default {
  async asyncData ({ params, $fire }) {
    const productData = await $fire.firestore.collection('products').doc(params.id).get()
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
    return { product }
  },
  data: () => ({
    overlay: false
  }),
  watch: {
    overlay (val) {
      val && setTimeout(() => {
        this.overlay = false
      }, 2000)
    }
  }
}
</script>
