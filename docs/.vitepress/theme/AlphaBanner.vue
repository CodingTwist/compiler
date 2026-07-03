<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";

// VPNav is `position: fixed; top: var(--vp-layout-top-height)` and VPContent
// margins itself down by the same var - both assume the banner reports its
// own (responsive, can wrap to 2 lines) height into it, rather than us
// pushing content down manually.
const el = ref<HTMLElement | null>(null);
let observer: ResizeObserver | undefined;

onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    document.documentElement.style.setProperty(
      "--vp-layout-top-height",
      `${(entry.target as HTMLElement).offsetHeight}px`,
    );
  });
  observer.observe(el.value!);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  document.documentElement.style.removeProperty("--vp-layout-top-height");
});
</script>

<template>
  <div ref="el" class="alpha-banner">
    <strong>Alpha:</strong> this compiler is under active development and updates will break your projects. Not recommended for real use yet.
  </div>
</template>

<style scoped>
.alpha-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: var(--vp-z-index-layout-top);
  background-color: var(--vp-c-yellow-soft);
  color: var(--vp-c-text-1);
  border-bottom: 1px solid var(--vp-c-yellow-2);
  padding: 8px 24px;
  font-size: 14px;
  line-height: 1.4;
  text-align: center;
}

.alpha-banner strong {
  color: var(--vp-c-yellow-1);
}
</style>

<!-- Unscoped on purpose: a static default for the layout-top offset so the
     very first paint (before hydration runs the ResizeObserver above) already
     places the nav/content below the banner instead of under it. The
     breakpoints approximate where the banner text wraps to 2 / 3 lines; the
     observer replaces this with the exact measured height once mounted. -->
<style>
:root {
  --vp-layout-top-height: 37px;
}
@media (max-width: 960px) {
  :root {
    --vp-layout-top-height: 57px;
  }
}
@media (max-width: 520px) {
  :root {
    --vp-layout-top-height: 76px;
  }
}
</style>
