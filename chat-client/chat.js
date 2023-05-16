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
    const privateMessaging = Vue.ref(true)
   

    // If we're private messaging use "me" as the channel,
    // otherwise use the channel value
    const $gf = Vue.inject('graffiti')
    let context = Vue.computed(()=> privateMessaging.value? [$gf.me] : [channel.value])

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
        addUserRequest: '',
        addUserRequestError: '',
        file: null,
        fileURI: null,
        downloadedImages: {},
        recipientUsername: '',
        myUsername: '',
        actorsToUsernames: {},
        currentConvoPlaceholder: {
            'placeholder': {
                id: 'id',
                preview: 'preview',
                actors: [],
                messages: []
            }
        },
        currentConvo: {
            'placeholder': {
                id: 'id',
                preview: 'preview',
                actors: [],
                messages: []
            }
        },
        recipients: [],
        groups: {},
        addedUsers: new Set(), 
        beforeCreateConvo: true,
        categoryNames: ['All', 'Not Responded', 'Pinned Messages'],
        currentCategory: 'All',
        categorySelected: '',
        groupsToCategories: {'All': new Set(), 'Not Responded': new Set()},
        timeOptionSelected: 'in',
        hours: 24,
        time: '20:00:00',
        date: '',       
        
    }
  },

  watch: {
    '$gf.me': async function(me) {
      this.myUsername = await this.resolver.actorToUsername(me);
    },

    async messages(messages) {
      // groups
      this.groups = {};

      for (const m of messages) {
        let key = new Set();
        let actors = []

        key.add(m.actor);
        actors.push(m.actor);

        if (!(m.actor in this.actorsToUsernames)) {
          this.actorsToUsernames[m.actor] = await this.resolver.actorToUsername(m.actor);
        }

        if (m.bto) {
            for (let id of m.bto) {
                key.add(id);
                actors.push(id);

                if (!(id in this.actorsToUsernames)) {
                  this.actorsToUsernames[id] = await this.resolver.actorToUsername(id);
                }
            }
        }

        key = String(Array.from(key).sort());
        if (!(key in this.groups)) {
            this.groups[key] = {
                id: key,
                preview: m.content,
                actors: Array.from(new Set(actors)),
                messages: [m]
            };
        } else {
            this.groups[key].messages.push(m);
            this.groups[key].preview = m.content;
        }
      }
    
    },
      
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
          (m.content || m.content == '')      &&
          // Is that property a string?
          typeof m.content=='string') 

      // Do some more filtering for private messaging
      let filteredMessages = [];
      if (this.privateMessaging) {
        for (let m of messages) {
          if (m.bto && m.bto.length > 0) {
            for (let c of m.context) {
              if (c === this.$gf.me) {
                filteredMessages.push(m);
              }
            }
          }
        }  
      }

      return filteredMessages
        // Sort the messages with the
        // most recently created ones first
        .sort((m1, m2)=> new Date(m2.published) - new Date(m1.published))
        // Only show the 10 most recent ones
        // .slice(0,10)
    },

    groupMessages() {
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
      let filteredMessages = [];
      if (this.privateMessaging) {
        for (let m of messages) {
          if (m.bto && m.bto.length > 0) {
            for (let c of m.context) {
              if (c === this.$gf.me) {
                if (String(Array.from(new Set(m.context)).sort()) === String(Array.from(new Set(this.recipients)).sort())) {
                  filteredMessages.push(m);
                }
              }
            }
          }
        }  
      }
    
      return filteredMessages
        // Sort the messages with the
        // most recently created ones first
        .sort((m1, m2)=> new Date(m2.published) - new Date(m1.published))
        // Only show the 10 most recent ones
        // .slice(0,10)
    },

    groupCategories() {
      this.groupsToCategories = {'All': new Set(), 'Not Responded': new Set()};

      for (let groupKey of Object.keys(this.groups)) {
        const group = this.groups[groupKey];
        this.groupsToCategories['All'].add(group.id);

        if (group.messages[0].actor !== this.$gf.me) {
          this.groupsToCategories['Not Responded'].add(group.id);
        }
        
      }
      return this.groupsToCategories;
    },

    pins() {
      return this.messagesRaw.filter( p => p.type === 'Pin');
    },

    numReminders() {
      return this.messagesRaw.filter( r => r.type === 'Reminder' && !(new Date(r.timeToRemind) - new Date() > 0)).length;
    },

    reminders() {
      let reminders = [];
      let currentTime = new Date();

      for (let r of this.messagesRaw) {
        if (r.type === 'Reminder') {
          const beforeReminder = new Date(r.timeToRemind) - currentTime > 0;
          if (!beforeReminder) {
            reminders.push(r);
          }
        }
      }

      return reminders;
    },
    selectedConvos() {
      let selectedDivs = document.querySelectorAll('#selectBoxes');
      for (let s of selectedDivs) {
        if (s.firstChild.checked === true) {
          return true;
        }
      }
      return false;
    }

  },

  methods: {
    // selectedConvos() {
    //   if (!selectBoxes) {return false}
    //   let selectedConvos = Array.from(selectBoxes)
    //   .map(box => box.firstChild)
    //   .filter(checkboxInput => checkboxInput.checked === true);
    //   return selectedConvos.length > 0;
    // },
    isPinned(messageid) {
      let relevantPins = this.pins.filter( p => p.object === messageid);
      return relevantPins.length > 0? true : false; 
    },
    isPinnedWithPin(messageid) {
      for (let p of this.pins) {
        if (p.object === messageid) {
          return p;
        }
      }
      return null;
    },
    show(...elements) {
        for (let element of arguments) {
            element.removeAttribute('hidden');
        }
    },
    hide(...elements) {
        for (let element of arguments) {
            element.setAttribute('hidden', 'hidden');
        }
    },
    hideByClass(...elements) {
      for (let element of arguments) {
        element.setAttribute('class', 'hide');
      }
    },
    showByClass(elements, className) {
      for (let e of elements) {
        e.setAttribute('class', className);
      }
    },
    onNewConvo() {      
      this.hideByClass(newReminder, newConvo);
      this.show(newConvoForm);
      this.show(addUserForm);
      this.beforeCreateConvo = true;
    },
    onCreateConvo() {
      this.hide(addUserForm);
      this.hide(createConvo);
      this.show(startConvoSendForm);
      this.beforeCreateConvo = false;
    },      
    fromSelecting() {
      this.hide(...selectBoxes);
      this.hideByClass(exitSelect, setReminder, reminderInput);

      for (let box of selectBoxes) {
        box.firstChild.checked=false;
      }
    },
    onNewReminder() {
      this.show(...selectBoxes,);
      this.showByClass([exitSelect], 'action');
      this.showByClass([reminderInput, setReminder], 'action');
      const dateInput = document.querySelector('#datePicker');
      const today = new Date();
      let month = String(today.getMonth() + 1);
      month = month.length < 2 ? '0' + String(month) : String(month);
      let day = String(today.getDate());
      day = day.length < 2 ? '0' + String(day) : String(day);
      this.date = today.getFullYear() + '-' + month + '-' + day;

    },
    async addUser() {
      loader4.setAttribute("class", "")
      try {
        let result = await this.resolver.usernameToActor(this.addUserRequest);
        if (result === null) {
          this.addUserRequestError = ' User does not exist'
        } else {
          this.addUserRequestError = ' User found!'
          this.addedUsers.add(result);
          if (!(result in this.actorsToUsernames)) {
            this.actorsToUsernames[result] = this.addUserRequest;
          }
          this.addUserRequest='';
          this.addUserRequestError='';
        }
      } catch(error) {
        this.addUserRequestError =' ' + error.toString();
      }
      loader4.setAttribute("class", "loaded");
    },
    fromAction() {
      for (let e of document.querySelectorAll('.action-form')) {
        this.hide(e);
      }
      this.showByClass([newReminder, newConvo], 'action');
      this.addUserRequestError = '';
      this.addUserRequest = '';
      this.addedUsers = new Set();
      this.hide(startConvoSendForm);
    },
    toCategory(category) {
      this.currentCategory = category;
      this.fromGroup();
    },
    toGroup(group) {
        let previews = document.querySelector('div.conversation-previews');
        this.hide(previews);

        let convo = document.querySelector('.conversation');
        this.show(convo, sendForm);

        this.currentConvo = group;
        this.recipients = group.actors;
    },
    fromGroup() {
        this.currentConvo = this.currentConvoPlaceholder;
        let convo = document.querySelector('.conversation');
        this.messageText = '';

        this.hide(convo, sendForm);

        let previews = document.querySelector('.conversation-previews');
        this.show(previews);

        this.recipients = []
        
        
    },
    onImageAttachment(event) {
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
    async sendAndCreate () {
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


      
      // The bto field makes messages private
      
      message.bto = Array.from(this.addedUsers);
      message.context = Array.from(this.addedUsers.add(this.$gf.me));
      const key = String(Array.from(new Set(message.context)).sort());
  
      // Send!
      const result = await this.$gf.post(message);  

      this.messageText = '';
      this.file = null;
      this.fileURI = null;
      this.addedUsers = []
      this.fromAction();
    },
    removeReminder(reminder) {
      this.$gf.remove(reminder);
    },
    togglePin(event, messageid) {
      const pin = {
        type: 'Pin',
        object: messageid,
        context: [this.$gf.me]
      }
      const returnedPin = this.isPinnedWithPin(messageid);
      if (returnedPin !== null) {
        event.target.closest('.message-bubble').setAttribute('id','delete');
        setTimeout(() => {
            this.$gf.remove(returnedPin);
        }, 500);
      } else {
        this.$gf.post(pin)
      }
    },
    sendReminder() {
      let selectedConvos = Array.from(selectBoxes)
        .map(box => box.firstChild)
        .filter(checkboxInput => checkboxInput.checked === true)
        .map(checked => checked.name);
      
      if (selectedConvos.length > 0) {

        for (let id of selectedConvos) {
          const group = this.groups[id];
          let people = '';
          for (let a of group.actors) {
            if (a !== this.$gf.me || group.actors.length === 1) {
              people += ' ' + this.actorsToUsernames[a] + ','
            }
          }
          people = people.slice(0,people.length-1);
    
          let timeToRemind = null;
          let currentTime = new Date();
          if (this.timeOptionSelected === 'in') {
            let currentHours = currentTime.getHours();
            timeToRemind = new Date(currentTime.setHours(currentHours + this.hours)); 
          } else if (this.timeOptionSelected === 'at') {
            timeToRemind = new Date(String(this.date) + ' ' + String(this.time));
          }
    
          const reminder = {
            type: 'Reminder',
            object: 'groupid',
            people: people,
            timeCreated: String(currentTime),
            timeToRemind: String(timeToRemind),
            context: [this.$gf.me]
          }
    
          this.$gf.post(reminder);
          reminderConfirmation.innerText = "Reminder set for " + timeToRemind.toString().slice(0,-36)
    
        }
        this.fromSelecting();

        setTimeout(() => {
          reminderConfirmation.innerText = "";
        }, 5000);

      }
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
            message.bto = [...this.recipients]
            message.context = [...this.recipients]
            message.context.push(this.$gf.me);
            message.context = Array.from(new Set(message.context));

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

const Profile = {
    props: {
        actor: {
            type: String
        },
        editable: {
            type: Boolean,
            default: false
        },
        anonymous: {
            type: String,
            default: 'images/user-solid.svg'        
        }
    },

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
            m.icon &&
            m.icon.type == 'Image' &&
            typeof m.icon.magnet == 'string' )
          // Choose the most recent one or null if none exists
          .reduce((prev, curr)=> !prev || curr.published > prev.published? curr : prev, null)
      }
    },
  
    data() {
      return {
        file: null,
        editing: false
      }
    },

    methods: {
        editProfile() {
            this.editing = true;
        },
        async savePicture() {
            if (!this.file) return

            this.$gf.post({
                type: 'Profile',
                icon: {
                type: 'Image',
                magnet: await this.$gf.media.store(this.file)
                }
            })
            this.editing = false;
        },

        onPicture(event) {
            const file = event.target.files[0]
            this.file = file
        }
    },
    template: '#profile'
  }
const MagnetImg = {
  props: {
    src: String,
    loading: {
      type: String,
      default: 'images/loader.svg'
    },
    error: {
      type: String,
      default: '' // empty string will trigger broken link
    }
  },

  data() {
    return {
      fetchedSrc: ''
    }
  },

  watch: {
    src: {
      async handler(src) {
        this.fetchedSrc = this.loading
        try {
          this.fetchedSrc = await this.$gf.media.fetchURL(src)
        } catch {
          this.fetchedSrc = this.error
        }
      },
      immediate: true
    }
  },

  template: '#magnet-img'

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
        return [...new Set(this.reads.filter(l=> l.actor === this.$gf.me))]
      },

      readActors() {
        return [...new Set(this.reads.map(r=>r.actor))]
      }

    },
  
   
    mounted() {
        if (!(this.myReads.length)) {
            this.$gf.post({
            type: 'Read',
            object: this.messageid,
            context: [this.messageid]
            })
        }
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
                l.content)
            .sort((m1, m2)=> new Date(m2.published) - new Date(m1.published));
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
  
  Vue.createApp(app)
   .component('name', Name)
   .component('like', Like)
   .component('magnet-img', MagnetImg)
   .component('profile', Profile)
   .component('note', Note)
   .component('read', Read)
   .use(GraffitiPlugin(Vue))
   .mount('#app')
