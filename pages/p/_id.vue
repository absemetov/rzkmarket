<template>
  <div>
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
          <v-img class="mx-auto" :src="item.src" max-width="450" />
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
    showArrows: false,
    hideDelimiters: true
  }),
  async fetch () {
    const productData = await this.$fire.firestore.collection('products').doc(this.$route.params.id).get()
    if (productData.data().mainPhoto) {
      this.mainPhoto = {
        thumbnail: `https://storage.googleapis.com/rzk-market-ua.appspot.com/photos/products/${productData.id}/1/${productData.data().mainPhoto[1]}.jpg`,
        big: `https://storage.googleapis.com/rzk-market-ua.appspot.com/photos/products/${productData.id}/2/${productData.data().mainPhoto[2]}.jpg`
      }
    } else {
      // default img
      this.mainPhoto = {
        thumbnail: 'https://s3.eu-central-1.amazonaws.com/rzk.com.ua/250.56ad1e10bf4a01b1ff3af88752fd3412.jpg',
        big: 'https://s3.eu-central-1.amazonaws.com/rzk.com.ua/250.56ad1e10bf4a01b1ff3af88752fd3412.jpg'
      }
    }
    const product = {
      id: productData.id,
      name: productData.data().name,
      tagsNames: productData.data().tagsNames
    }
    this.product = product
    this.items.push({ src: this.mainPhoto.big })
    if (this.items.length > 1) {
      this.hideDelimiters = false
      this.showArrows = true
    }
  },
  methods: {
    onClickOutside () {
      this.overlay = false
    }
  }
}
</script>
<style scoped>

</style>
