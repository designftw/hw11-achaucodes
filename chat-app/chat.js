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
      recipientUsernameError2: '',
      recipientUsernameRequest: '',
      file: null,
      fileURI: null,
      downloadedImages: {},
      recipientUsername: '',
      myUsername: '',
      actorsToUsernames: {}
    }
  },

  watch: {
    '$gf.me': async function(me) {
      this.myUsername = await this.resolver.actorToUsername(me);
    },

    async messages(messages) {
      for (const m of messages) {
        if (!(m.actor in this.actorsToUsernames)) {
          this.actorsToUsernames[m.actor] = await this.resolver.actorToUsername(m.actor);
        }
        if (m.bto && m.bto.length && !(m.bto[0] in this.actorsToUsernames)) {
          this.actorsToUsernames[m.bto[0]] = await this.resolver.actorToUsername(m.bto[0]);
        }
      }
    },

    async messagesWithAttachments(messages) {
        for (const m of messages) {
          if (!(m.attachment.magnet in this.downloadedImages)) {
            this.downloadedImages[m.attachment.magnet] = "downloading"
            let blob
            try {
              blob = await this.$gf.media.fetch(m.attachment.magnet)
            } catch(e) {
              this.downloadedImages[m.attachment.magnet] = "error"
              continue
            }
            this.downloadedImages[m.attachment.magnet] = URL.createObjectURL(blob)
          }
        }
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

    messagesWithAttachments() {
        return this.messages.filter(m=>
          m.attachment &&
          m.attachment.type == 'Image' &&
          typeof m.attachment.magnet == 'string')
    }
  },

  methods: {
    changeMessageType(event) {
        event.target.nextSibling.setAttribute('class','selected');
        if (event.target.id == "channel") {
            event.target.nextSibling.nextSibling.nextSibling.setAttribute('class', 'unselected');
        } else {
            event.target.previousSibling.setAttribute('class', 'unselected');
        }
    },
    async onImageAttachment(event) {
      const file = event.target.files[0];
      this.file = file;
    },
    dateTimeText (date) {
      let dateTime = Date(date);
      return toString(dateTime);
    },
    async copy(event, text) {
      navigator.permissions.query({name: "clipboard-write"}).then((result) => {
        if (result.state === "granted" || result.state === "prompt") {
          let copyText = text;
        }
      });
      navigator.clipboard.writeText(text).then(() => {
        let button = document.querySelector('button.id');
        let originalButtonText = button.innerText;
        event.target.innerText = "copied!";
        setTimeout(() => {
          event.target.innerHTML = originalButtonText;
        }, 500);
      }, () => {
        console.log("error while copying text");
      });
      
    },
    async sendMessage() {
        const message = {
            type: 'Note',
            content: this.messageText,
        };

        if (this.file !== null) {
            const magnet = await this.$gf.media.store(this.file);
            message.attachment = {
                type: 'Image',
                magnet: magnet
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
        this.$gf.post(message);        
        this.messageText = '';
        this.file = null;
        this.fileURI = null;
    },

    removeMessage(event, message) {
        event.target.closest('.message-bubble').setAttribute('id','delete');
        setTimeout(() => {
            this.$gf.remove(message);
        }, 500);
        
    },

    startEditMessage(event,message) {
        
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
        this.myUsername = username;
      } catch(error) {
        this.usernameRequestError=' ' + error.toString();
      }
      document.querySelector("#loader").setAttribute("class", "loaded");      
    },

    async usernameToActor(username) {
      document.querySelector("#loader2").setAttribute("class", "");
      this.recipientUsernameError='';
      try {
        let result = await this.resolver.usernameToActor(username);
        this.recipient = result;
        if (!result) {
          this.recipientUsernameError=' could not find user with that username. ';
        }
      } catch(error) {
        this.recipientUsernameError=' ' + error;
      }
      document.querySelector("#loader2").setAttribute("class", "loaded");
    },

    async actorToUsername(actor) {
      document.querySelector("#loader3").setAttribute("class", "");
      this.recipientUsernameError2='';
      try {
        let result = await this.resolver.actorToUsername(actor);
        this.recipientUsernameRequest = result;
        if (!result) {
          this.recipientUsernameError2=' could not find user with that id. '
        }
      } catch(error) {
        this.recipientUsernameError2=' ' + error;
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

    saveName(event) {
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
      this.editing = false;
    }
  },

  template: '#name'
}



const Read =  {
    props: ["messageid"],
  
    setup(props) {
      const $gf = Vue.inject('graffiti')
      const messageid = Vue.toRef(props, 'messageid')
      const { objects: readsRaw } = $gf.useObjects([messageid])
      return { readsRaw }
    },
  
    computed: {
      reads() {
        return this.readsRaw.filter(l=>
          l.type == 'Read' &&
          l.object == this.messageid)
      },
  
      numReads() {
        // Unique number of actors
        return [...new Set(this.reads.map(l=>l.actor))].length
      },
  
      myReads() {
        return this.reads.filter(l=> l.actor === this.$gf.me)
      }
    },
  
    methods: {
      checkRead() {
        if (!this.myReads.length) {
            this.$gf.post({
                type: 'Read',
                object: this.messageid,
                context: [this.messageid]
            })
        }
      },

      
    },
  
    template: '#read'
}

const Note = {
    props: ["messageid"],

    data() {
        // Initialize some more reactive variables
        return {
            replyText: '',
            actorsToUsernames: {},
            usernameRequest: ''
            
        }
    },
    created() {
        this.resolver = new Resolver(this.$gf)
    },

    setup(props) {
      const $gf = Vue.inject('graffiti')
      const messageid = Vue.toRef(props, 'messageid')
      const { objects: notesRaw } = $gf.useObjects([messageid])
      return { notesRaw }
    },
    
    watch: {
        async notes(notes) {
            for (const n of notes) {
              if (!(n.actor in this.actorsToUsernames)) {
                this.actorsToUsernames[n.actor] = await this.resolver.actorToUsername(n.actor);
              }
            }
        },
    },

    computed: {
      notes() {
        let notes = this.notesRaw
            .filter(l=>
                l.type == 'Note' &&
                l.inReplyTo == this.messageid &&
                l.content);
        return notes;
      },

      numNotes() {
        // Unique number of actors
        // return [...new Set(this.notes.map(l=>l.actor))].length
        return this.notes.length;
      },
  
      myNotes() {
        return this.notes.filter(l=> l.actor === this.$gf.me)
      }
    },
  
    methods: {
        addNote(content) {
            this.$gf.post({
                type: 'Note',
                content: content,
                inReplyTo: this.messageid,
                context: [this.messageid],
            })
        },

        startReply(event, message) {
            event.target.nextSibling.removeAttribute('hidden');
        },

        sendReply(event) {
            let content = this.replyText;
            this.addNote(content);
            event.target.closest('form').setAttribute('hidden', 'true');
            this.replyText='';
        },

        removeReply(note) {
            this.$gf.remove(note);
        },

        async actorToUsername(actor) {
            try {
                let result = await this.resolver.actorToUsername(actor);

            } catch (error) {
                console.log(error);
            }
        },

    },
  
    template: '#note'
  }

const Like = {
    props: ["messageid"],
  
    setup(props) {
      const $gf = Vue.inject('graffiti')
      const messageid = Vue.toRef(props, 'messageid')
      const { objects: likesRaw } = $gf.useObjects([messageid])
      return { likesRaw }
    },
  
    computed: {
      likes() {
        return this.likesRaw.filter(l=>
          l.type == 'Like' &&
          l.object == this.messageid)
      },
  
      numLikes() {
        // Unique number of actors
        return [...new Set(this.likes.map(l=>l.actor))].length
      },
  
      myLikes() {
        return this.likes.filter(l=> l.actor === this.$gf.me)
      }
    },
  
    methods: {
      toggleLike(event) {

        if (event.target.innerText ==='Like 👍') {
            event.target.setAttribute('class','transition');
        } else {
            event.target.setAttribute('class','');
        }
        
        if (this.myLikes.length) {
          this.$gf.remove(...this.myLikes)
        } else {
          this.$gf.post({
            type: 'Like',
            object: this.messageid,
            context: [this.messageid]
          })
        }
      }
    },
  
    template: '#like'
  }
  
  app.components = { Name, Like, Read, Note }
  Vue.createApp(app)
     .use(GraffitiPlugin(Vue))
     .mount('#app')
  