import * as Vue from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js'
import { mixin } from "https://mavue.mavo.io/mavue.js";
import GraffitiPlugin from 'https://graffiti.garden/graffiti-js/plugins/vue/plugin.js'
import Resolver from './resolver.js'

const app = {
  // Import MaVue
  mixins: [mixin],

  // Import resolver
  created() {
    this.resolver = new Resolver(this.$gf)
  },

  setup() {
    // Initialize the name of the channel we're chatting in
    const channel = Vue.ref('default')

    // And a flag for whether or not we're private-messaging
    const privateMessaging = Vue.ref(false)

    // If we're private messaging use "me" as the channel,
    // otherwise use the channel value
    const $gf = Vue.inject('graffiti')
    const context = Vue.computed(()=> privateMessaging.value? [$gf.me] : [channel.value])

    // Initialize the collection of messages associated with the context
    const { objects: messagesRaw } = $gf.useObjects(context)
    return { channel, privateMessaging, messagesRaw }
  },

  watch: {
    messages(messages) {
      console.log("messages changed?");
      let imageMessages = messages.filter(m=>
        m.attachment &&
        attachment.type === "Image" &&
        typeof(attachment.magnet) === String
      );

      for (let imageMessage of imageMessages) {
        if (!(imageMessage.magnet in this.downloadedImages)) {
          console.log("not in cache");
          this.downloadedImages[imageMessage.magnet] = true;
        }
      }

    }
  },

  data() {
    // Initialize some more reactive variables
    return {
      messageText: '',
      editID: '',
      editText: '',
      recipient: '',
      usernameRequest: '',
      usernameRequestError: '',
      recipientUsernameError: '',
      recipientUsernameRequest: '',
      file: null,
      fileURI: null,
      downloadedImages: {}
    }
  },

  computed: {
    messages() {
      let messages = this.messagesRaw
        // Filter the "raw" messages for data
        // that is appropriate for our application
        // https://www.w3.org/TR/activitystreams-vocabulary/#dfn-note
        .filter(m=>
          // Does the message have a type property?
          m.type         &&
          // Is the value of that property 'Note'?
          m.type=='Note' &&
          // Does the message have a content property?
          m.content      &&
          // Is that property a string?
          typeof m.content=='string') 

      // Do some more filtering for private messaging
      if (this.privateMessaging) {
        messages = messages.filter(m=>
          // Is the message private?
          m.bto &&
          // Is the message to exactly one person?
          m.bto.length == 1 &&
          (
            // Is the message to the recipient?
            m.bto[0] == this.recipient ||
            // Or is the message from the recipient?
            m.actor == this.recipient
          ))
      }

      return messages
        // Sort the messages with the
        // most recently created ones first
        .sort((m1, m2)=> new Date(m2.published) - new Date(m1.published))
        // Only show the 10 most recent ones
        .slice(0,10)
    },
  },

  methods: {
    async onImageAttachment(event) {
      const file = event.target.files[0];
      console.log(file.name);
      this.file = file;
      this.fileURI = await this.$gf.media.store(file);
    },
    dateTimeText (date) {
      let dateTime = Date(date);
      return toString(dateTime);
    },
    async copy(text) {
      navigator.permissions.query({name: "clipboard-write"}).then((result) => {
        if (result.state === "granted" || result.state === "prompt") {
          let copyText = text;
        }
      });
      navigator.clipboard.writeText(text).then(() => {
        let button = document.querySelector('button.id');
        let originalButtonText = button.innerText;
        button.innerText = "copied!";
        setTimeout(() => {
          button.innerHTML = originalButtonText;
        }, 1000);
      }, () => {
        console.log("error while copying text");
      });
      
    },
    sendMessage() {
      let message = null;
      if (this.file) {
        console.log("okay");
        message = {
          type: 'Note',
          content: this.messageText,
          attachment: {
            type: 'Image',
            magnet: this.fileURI,
          }
        }
      } else {
        message = {
          type: 'Note',
          content: this.messageText,
        }
      }


      // The context field declares which
      // channel(s) the object is posted in
      // You can post in more than one if you want!
      // The bto field makes messages private
      if (this.privateMessaging) {
        message.bto = [this.recipient]
        message.context = [this.$gf.me, this.recipient]
      } else {
        message.context = [this.channel]
      }

      // Send!
      this.$gf.post(message)
      this.messageText = '';
      this.file = null;
      this.fileURI = null;
    },

    removeMessage(message) {
      this.$gf.remove(message)
    },

    startEditMessage(message) {
      // Mark which message we're editing
      this.editID = message.id
      // And copy over it's existing text
      this.editText = message.content
    },

    saveEditMessage(message) {
      // Save the text (which will automatically
      // sync with the server)
      message.content = this.editText
      // And clear the edit mark
      this.editID = ''
    },

    async requestUsername(username) {
      document.querySelector("#loader").setAttribute("class", "");
      try {
        let result = await this.resolver.requestUsername(username);
        this.usernameRequestError=' ' + result + '!';
      } catch(error) {
        this.usernameRequestError=' ' + error;
      }
      document.querySelector("#loader").setAttribute("class", "loaded");      
    },

    async usernameToActor(username) {
      document.querySelector("#loader2").setAttribute("class", "");
      try {
        let result = await this.resolver.usernameToActor(username);
        this.recipient = result;
        if (!result) {
          this.recipientUsernameError=' could not find user with that username. '
        }
      } catch(error) {
        this.recipientUsernameError=' ' + error;
      }
      document.querySelector("#loader2").setAttribute("class", "loaded");
    },

    async actorToUsername(actor) {
      document.querySelector("#loader3").setAttribute("class", "");
      try {
        let result = await this.resolver.actorToUsername(actor);
        this.recipientUsernameRequest = result;
        if (!result) {
          this.recipientUsernameError=' could not find user with that id. '
        }
      } catch(error) {
        this.recipientUsernameError=' ' + error;
      }
      document.querySelector("#loader3").setAttribute("class", "loaded");
    }

  }
}

const Name = {
  props: ['actor', 'editable'],

  setup(props) {
    // Get a collection of all objects associated with the actor
    const { actor } = Vue.toRefs(props)
    const $gf = Vue.inject('graffiti')
    return $gf.useObjects([actor])
  },

  computed: {
    profile() {
      return this.objects
        // Filter the raw objects for profile data
        // https://www.w3.org/TR/activitystreams-vocabulary/#dfn-profile
        .filter(m=>
          // Does the message have a type property?
          m.type &&
          // Is the value of that property 'Profile'?
          m.type=='Profile' &&
          // Does the message have a name property?
          m.name &&
          // Is that property a string?
          typeof m.name=='string')
        // Choose the most recent one or null if none exists
        .reduce((prev, curr)=> !prev || curr.published > prev.published? curr : prev, null)
    }
  },

  data() {
    return {
      editing: false,
      editText: '',
    }
  },

  methods: {
    editName() {
      this.editing = true
      // If we already have a profile,
      // initialize the edit text to our existing name
      this.editText = this.profile? this.profile.name : this.editText
    },

    saveName() {
      if (this.profile) {
        // If we already have a profile, just change the name
        // (this will sync automatically)
        this.profile.name = this.editText
      } else {
        // Otherwise create a profile
        this.$gf.post({
          type: 'Profile',
          name: this.editText
        })
      }

      // Exit the editing state
      this.editing = false
    }
  },

  template: '#name'
}

app.components = { Name }
Vue.createApp(app)
   .use(GraffitiPlugin(Vue))
   .mount('#app')
