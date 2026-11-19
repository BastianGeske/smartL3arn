<script setup lang="ts">
import { useId } from 'vue'
import { useI18n } from '../i18n'
const model = defineModel<string>({ required: true })
withDefaults(defineProps<{ label: string; inputId?: string; disabled?: boolean; integer?: boolean; placeholder?: string; error?: string }>(), { disabled: false, integer: false })
const { t } = useI18n()
const errorId = `${useId()}-number-error`
function sign() {
  const value = model.value.trim()
  model.value = /^[-−]/.test(value) ? value.slice(1) : '-' + value.replace(/^\+/, '')
}
</script>
<template>
  <div class="task-number-input" :class="{ 'has-error': error }">
    <input :id="inputId" v-model="model" class="input" :inputmode="integer ? 'numeric' : 'decimal'" :aria-label="label" :aria-invalid="error ? true : undefined"
      :aria-describedby="error ? errorId : undefined" :placeholder="placeholder" :disabled="disabled" maxlength="2048" />
    <button class="btn btn-secondary" type="button" :disabled="disabled" :aria-label="`${t('task.sign')} · ${label}`" :title="t('task.sign')" @click="sign">±</button>
    <small v-if="error" :id="errorId" class="task-number-error">{{ error }}</small>
  </div>
</template>
