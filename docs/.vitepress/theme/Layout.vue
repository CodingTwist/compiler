<script setup lang="ts">
import DefaultTheme from "vitepress/theme";
import AlphaBanner from "./AlphaBanner.vue";

const { Layout } = DefaultTheme;
</script>

<template>
  <Layout>
    <template #layout-top>
      <AlphaBanner />
    </template>
  </Layout>
</template>
